'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, Message, fetchMessages } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket-context';
import { useAuth } from '@/lib/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface ChatAreaProps {
  room: Room;
}

export function ChatArea({ room }: ChatAreaProps) {
  const { messages: wsMessages, sendMessage } = useWebSocket();
  const { auth } = useAuth();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Get messages from WebSocket
  const roomMessages = wsMessages[room.id] || [];
  
  // Load initial messages
  useEffect(() => {
    async function loadMessages() {
      try {
        setIsLoading(true);
        const result = await fetchMessages(room.id, 20);
        setOlderMessages(result.messages);
        setHasMoreMessages(result.pagination.hasMore);
      } catch (error) {
        console.error('Error loading messages:', error);
        toast.error('Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadMessages();
    
    // Scroll to bottom on room change
    setTimeout(() => {
      scrollToBottom();
    }, 100);
    
    return () => {
      setOlderMessages([]);
    };
  }, [room.id]);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (roomMessages.length > 0) {
      scrollToBottom();
    }
  }, [roomMessages.length]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Load more messages
  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMoreMessages) return;
    
    try {
      setIsLoadingMore(true);
      const oldestMessage = olderMessages[olderMessages.length - 1];
      
      if (!oldestMessage) return;
      
      const result = await fetchMessages(room.id, 20, oldestMessage.timestamp);
      
      if (result.messages.length > 0) {
        setOlderMessages(prev => [...prev, ...result.messages]);
        setHasMoreMessages(result.pagination.hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      toast.error('Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  };
  
  // Combine WebSocket messages with older messages from API
  const allMessages = [...roomMessages];
  
  // Add older messages, avoiding duplicates
  olderMessages.forEach(msg => {
    if (!allMessages.some(m => m.id === msg.id)) {
      allMessages.push(msg);
    }
  });
  
  // Sort by timestamp (newest first)
  allMessages.sort((a, b) => b.timestamp - a.timestamp);
  
  // Send message handler
  const handleSendMessage = () => {
    if (!input.trim()) return;
    
    sendMessage(room.id, input.trim());
    setInput('');
  };
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Get user initials for avatar
  const getUserInitials = (username: string) => {
    return username
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };
  
  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };
  
  // Group messages by date
  const messagesByDate: Record<string, Message[]> = {};
  allMessages.forEach(message => {
    const date = formatDate(message.timestamp);
    if (!messagesByDate[date]) {
      messagesByDate[date] = [];
    }
    messagesByDate[date].push(message);
  });
  
  // Sort dates (newest first)
  const sortedDates = Object.keys(messagesByDate).sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  return (
    <div className="flex flex-col h-full">
      {/* Room header */}
      <div className="border-b p-4">
        <h2 className="text-xl font-semibold">{room.name}</h2>
      </div>
      
      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-4 flex flex-col-reverse"
        ref={messagesContainerRef}
      >
        <div ref={messagesEndRef} />
        
        {isLoading ? (
          <div className="flex justify-center my-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {sortedDates.map(date => (
              <div key={date} className="mb-6">
                <div className="flex justify-center mb-4">
                  <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                    {date}
                  </div>
                </div>
                
                {messagesByDate[date]
                  .sort((a, b) => a.timestamp - b.timestamp) // Sort messages within the day (oldest first)
                  .map(message => (
                    <div 
                      key={message.id} 
                      className={`flex mb-4 ${
                        message.type === 'system' ? 'justify-center' : 'items-start'
                      }`}
                    >
                      {message.type === 'system' ? (
                        <div className="bg-muted/60 px-3 py-1 rounded-full text-xs text-muted-foreground">
                          {message.content}
                        </div>
                      ) : (
                        <>
                          <Avatar className="mr-2 mt-0.5">
                            <AvatarFallback>
                              {getUserInitials(message.username || 'U')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-baseline">
                              <h3 className="font-semibold mr-2">{message.username}</h3>
                              <span className="text-xs text-muted-foreground">
                                {formatTime(message.timestamp)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            ))}
            
            {hasMoreMessages && (
              <div className="flex justify-center my-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex space-x-2">
          <Textarea
            placeholder={`Message ${room.name}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-10 flex-1 resize-none"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!input.trim()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
} 
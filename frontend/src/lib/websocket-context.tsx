import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Message } from './api';
import { getAuthToken } from './auth';

interface WebSocketContextType {
  connected: boolean;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string) => void;
  messages: Record<string, Message[]>;
  clearMessages: (roomId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Function to create a new WebSocket connection
  const createConnection = useCallback(() => {
    const token = getAuthToken();
    if (!token) return;
    
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setConnected(true);
      toast.success('Connected to chat server');
      
      // Clear any reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    
    ws.onclose = (event) => {
      setConnected(false);
      
      if (event.code !== 1000) { // Not a normal closure
        toast.error('Disconnected from chat server. Reconnecting...');
        
        // Attempt to reconnect after a delay
        reconnectTimeoutRef.current = setTimeout(() => {
          createConnection();
        }, 3000);
      }
    };
    
    ws.onerror = () => {
      toast.error('WebSocket error occurred');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different message types
        if (data.type === 'error') {
          toast.error(data.content);
        } else if (data.type === 'history') {
          // Handle history messages
          setMessages(prev => {
            const roomMessages = prev[data.roomId] || [];
            const newMessages = [...data.messages, ...roomMessages];
            
            // Remove duplicates
            const uniqueMessages = newMessages.filter((msg, index, self) => 
              index === self.findIndex((m) => m.id === msg.id)
            );
            
            // Sort by timestamp (newest first)
            uniqueMessages.sort((a, b) => b.timestamp - a.timestamp);
            
            return {
              ...prev,
              [data.roomId]: uniqueMessages
            };
          });
        } else if (data.roomId) {
          // Handle regular message
          setMessages(prev => {
            const roomMessages = prev[data.roomId] || [];
            
            // Check if message already exists (prevent duplicates)
            if (roomMessages.some(msg => msg.id === data.id)) {
              return prev;
            }
            
            // Add new message to the beginning (newest first)
            return {
              ...prev,
              [data.roomId]: [data, ...roomMessages]
            };
          });
        }
      } catch (err) {
        console.error('Error parsing WebSocket message', err);
      }
    };
    
    return ws;
  }, []);
  
  // Initialize WebSocket connection
  useEffect(() => {
    const ws = createConnection();
    
    // Cleanup on unmount
    return () => {
      if (ws) {
        ws.close(1000, 'Component unmounted');
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [createConnection]);
  
  // Function to join a chat room
  const joinRoom = useCallback((roomId: string) => {
    if (!connected || !wsRef.current) {
      toast.error('Not connected to chat server');
      return;
    }
    
    wsRef.current.send(JSON.stringify({
      type: 'join',
      roomId
    }));
  }, [connected]);
  
  // Function to leave a chat room
  const leaveRoom = useCallback((roomId: string) => {
    if (!connected || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'leave',
      roomId
    }));
  }, [connected]);
  
  // Function to send a message to a room
  const sendMessage = useCallback((roomId: string, content: string) => {
    if (!connected || !wsRef.current) {
      toast.error('Not connected to chat server');
      return;
    }
    
    wsRef.current.send(JSON.stringify({
      type: 'message',
      roomId,
      content
    }));
  }, [connected]);
  
  // Function to clear messages for a room
  const clearMessages = useCallback((roomId: string) => {
    setMessages(prev => {
      const newMessages = { ...prev };
      delete newMessages[roomId];
      return newMessages;
    });
  }, []);
  
  return (
    <WebSocketContext.Provider 
      value={{ 
        connected, 
        joinRoom, 
        leaveRoom, 
        sendMessage, 
        messages,
        clearMessages
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
} 
'use client';

import { useAuth } from '@/lib/auth-context';
import { useWebSocket } from '@/lib/websocket-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React from 'react';

interface ChatLayoutProps {
  roomsList: React.ReactNode;
  chatArea: React.ReactNode;
}

export function ChatLayout({ roomsList, chatArea }: ChatLayoutProps) {
  const { auth, logout } = useAuth();
  const { connected } = useWebSocket();
  
  const userInitials = auth.user?.name
    ? auth.user.name.split(' ').map(n => n[0]).join('')
    : '?';

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-semibold">Chat App</h1>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-muted-foreground">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Avatar>
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{auth.user?.name}</p>
              </div>
            </div>
            
            <Button variant="outline" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r bg-muted/40 p-4 overflow-y-auto hidden md:block">
          {roomsList}
        </aside>
        
        {/* Chat area */}
        <main className="flex-1 overflow-hidden">
          {chatArea}
        </main>
      </div>
    </div>
  );
} 
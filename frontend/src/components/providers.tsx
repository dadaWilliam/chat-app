'use client';

import { AuthProvider } from '@/lib/auth-context';
import { WebSocketProvider } from '@/lib/websocket-context';
import React from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WebSocketProvider>
        {children}
      </WebSocketProvider>
    </AuthProvider>
  );
} 
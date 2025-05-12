import { getAuthToken } from './auth';

export interface Room {
  id: string;
  name: string;
  created: number;
  createdBy?: string;
}

export interface Message {
  id: string;
  type: 'message' | 'system';
  roomId: string;
  content: string;
  userId?: string;
  username?: string;
  timestamp: number;
  source?: string;
}

export interface MessageResponse {
  messages: Message[];
  pagination: {
    count: number;
    hasMore: boolean;
    oldest: number | null;
    newest: number | null;
  };
}

// Fetch rooms
export async function fetchRooms(): Promise<Room[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch('/api/rooms', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch rooms');
  }

  return response.json();
}

// Fetch room details
export async function fetchRoom(roomId: string): Promise<Room> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`/api/rooms/${roomId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch room');
  }

  return response.json();
}

// Create a new room
export async function createRoom(name: string): Promise<Room> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    throw new Error('Failed to create room');
  }

  return response.json();
}

// Fetch messages for a room
export async function fetchMessages(
  roomId: string, 
  limit?: number, 
  before?: number, 
  after?: number,
  source?: 'redis' | 'mongodb'
): Promise<MessageResponse> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  let url = `/api/rooms/${roomId}/messages?`;
  
  if (limit) url += `limit=${limit}&`;
  if (before) url += `before=${before}&`;
  if (after) url += `after=${after}&`;
  if (source) url += `source=${source}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }

  return response.json();
}

// WebSocket connection helper
export function connectToWebSocket(token: string): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${token}`;
  
  return new WebSocket(wsUrl);
} 
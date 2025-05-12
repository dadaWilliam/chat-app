'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { RoomsList } from '@/components/chat/RoomsList';
import { ChatArea } from '@/components/chat/ChatArea';
import { Room } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket-context';
import { fetchRooms } from '@/lib/api';

export default function Home() {
  const { auth } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const { connected, joinRoom, leaveRoom } = useWebSocket();

  // Load rooms
  useEffect(() => {
    async function loadRooms() {
      if (!auth.isAuthenticated) return;
      
      try {
        setLoading(true);
        const roomsData = await fetchRooms();
        setRooms(roomsData);
        
        // Select first room if no room is selected
        if (roomsData.length > 0 && !selectedRoom) {
          setSelectedRoom(roomsData[0]);
        }
      } catch (error) {
        console.error('Error loading rooms:', error);
      } finally {
        setLoading(false);
      }
    }

    loadRooms();
  }, [auth.isAuthenticated]);

  // Join selected room via WebSocket
  useEffect(() => {
    if (connected && selectedRoom) {
      joinRoom(selectedRoom.id);
      
      // Cleanup: leave room when component unmounts or room changes
      return () => {
        leaveRoom(selectedRoom.id);
      };
    }
  }, [connected, selectedRoom, joinRoom, leaveRoom]);

  // Handle room selection
  const handleSelectRoom = (room: Room) => {
    if (selectedRoom) {
      leaveRoom(selectedRoom.id);
    }
    
    setSelectedRoom(room);
    joinRoom(room.id);
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <ChatLayout
          roomsList={<RoomsList 
            rooms={rooms} 
            selectedRoom={selectedRoom} 
            onSelectRoom={handleSelectRoom}
            loading={loading}
          />}
          chatArea={selectedRoom ? (
            <ChatArea
              room={selectedRoom}
              key={selectedRoom.id}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Select a room to start chatting</p>
            </div>
          )}
        />
      </main>
    </ProtectedRoute>
  );
}

'use client';

import { useState } from 'react';
import { Room, createRoom } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface RoomsListProps {
  rooms: Room[];
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
  loading: boolean;
}

export function RoomsList({ rooms, selectedRoom, onSelectRoom, loading }: RoomsListProps) {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast.error('Room name cannot be empty');
      return;
    }

    try {
      setIsCreatingRoom(true);
      const newRoom = await createRoom(newRoomName);
      toast.success(`Room "${newRoom.name}" created`);
      onSelectRoom(newRoom);
      setNewRoomName('');
      setIsDialogOpen(false);
    } catch (error) {
      toast.error('Failed to create room');
      console.error('Error creating room:', error);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Rooms</h2>
        </div>
        <div className="space-y-1 flex-1">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className="h-10 bg-muted/60 animate-pulse rounded-md"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Rooms</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">New Room</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new room</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="room-name">Room Name</Label>
              <Input 
                id="room-name" 
                value={newRoomName} 
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g. Project Discussion"
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button 
                onClick={handleCreateRoom} 
                disabled={isCreatingRoom || !newRoomName.trim()}
              >
                {isCreatingRoom ? 'Creating...' : 'Create Room'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="space-y-1 flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No rooms available
          </p>
        ) : (
          rooms.map((room) => (
            <button
              key={room.id}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                selectedRoom?.id === room.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted'
              }`}
              onClick={() => onSelectRoom(room)}
            >
              {room.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
} 
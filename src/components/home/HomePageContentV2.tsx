// src/components/home/HomePageContentV2.tsx
'use client';

import RoomCard from '@/components/rooms/RoomCard';
import AIChatBox from '@/components/chat/AIChatBox';

const rooms = [
  {
    id: 'neutral',
    title: 'Tea Room',
    description: 'Have a cup of tea and chat quietly',
    color: 'bg-gray-100',
  },
  {
    id: 'positive',
    title: 'Positive KTV',
    description: 'Share good news 🎤',
    color: 'bg-yellow-100',
  },
  {
    id: 'negative',
    title: 'Meditation Room',
    description: 'Pour your heart out & heal 🌙',
    color: 'bg-blue-100',
  },
];

export default function HomePageContentV2() {
  return (
    <section className="flex-1 p-6 grid grid-cols-2 gap-6 bg-[#f9fafb]">
      {/* Left side: Theme rooms */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Choose a Theme Chat Room</h2>
        <div className="grid grid-cols-1 gap-4">
          {rooms.map((room) => (
            <RoomCard key={room.id} {...room} />
          ))}
        </div>
      </div>

      {/* Right side: AI Chat Box */}
      <div className="bg-white rounded-xl shadow-md p-4 flex flex-col h-[500px]">
        <h2 className="text-xl font-bold text-gray-800 mb-4">AI Chat Assistant</h2>
        <div className="flex-1">
          <AIChatBox
            geminiApiKey={process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''}
          />
        </div>
      </div>
    </section>
  );
}
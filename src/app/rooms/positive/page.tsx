// src/app/rooms/positive/page.tsx
import Sidebar from '@/components/Sidebar';

export default function NeutralRoomPage() {
  return (
    <main className="flex">
      <Sidebar />
      <section className="flex-1 p-8 bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">🎤 KTV</h1>
        <p className="text-gray-600">You can sing as much as you want here.</p>

        {/* 可添加聊天模块、互动区占位 */}
        <div className="mt-6 border border-dashed rounded-md p-8 text-center text-gray-400">
          More function is coming soon...
        </div>
      </section>
    </main>
  );
}

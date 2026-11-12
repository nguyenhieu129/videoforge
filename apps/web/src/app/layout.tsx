import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoForge — AI Multi-Agent Video Production Pipeline',
  description:
    'Công cụ tạo video tự động bằng pipeline 17 AI agent, kết hợp HyperFrames, GSAP, three.js, Remotion, Manim, Blender MCP và FFmpeg.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen antialiased selection:bg-purple-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoForge 2.0 — Generative Motion Video Studio',
  description:
    'Bàn dựng video AI tự động 1 khung hình: Generative HTML5/CSS3/GSAP 30fps, Keyword Kinetic Typography, B-Roll tự động & Đồng bộ âm thanh 1:1.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark h-screen w-screen overflow-hidden">
      <body className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 antialiased selection:bg-purple-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

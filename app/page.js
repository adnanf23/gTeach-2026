import H1 from '@/components/atoms/heading/component';
import Paragraph from '@/components/atoms/paragraph/component';
import Link from 'next/link';
import React from 'react';



const ModernWhiteGridBackground = () => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white text-slate-900 font-sans">
      
      {/* SVG Grid Layer */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* 1. Masker untuk Efek Pudar (Atas Terang, Bawah Gelap/Menghilang) */}
          <linearGradient id="white-fade-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="1" /> 
            <stop offset="40%" stopColor="white" stopOpacity="0.3" />
            <stop offset="100%" stopColor="white" stopOpacity="0" /> 
          </linearGradient>
          
          <mask id="white-grid-mask">
            <rect width="100%" height="100%" fill="url(#white-fade-gradient)" />
          </mask>

          {/* 2. Pola Grid (Minimalist, Kerapatan Sedang) */}
          <pattern
            id="black-grid-pattern"
            width="44"
            height="44"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 44 0 L 0 0 0 44"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-slate-900/15"
            />
          </pattern>
        </defs>

        {/* 3. Eksekusi Pola Grid dengan Masker */}
        <rect 
          width="100%" 
          height="100%" 
          fill="url(#black-grid-pattern)" 
          mask="url(#white-grid-mask)" 
        />
      </svg>

      {/* Konten Utama */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* Badge */}
        <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold bg-slate-950 text-white mb-6 tracking-wide shadow-sm">
          Design System
        </span>
        
        {/* Heading */}
        <H1 align='center'>
            Sistem Manajemen Pembelajaran Terbaru<br />
          dengan{" "}
          <span className="bg-gradient-to-br from-blue-700 to-blue-400 bg-clip-text text-transparent">gTeach Space</span> 
        </H1>
        
        {/* Deskripsi */}
        <Paragraph align="center">
          Meningkatkan kemudahan dalam memanajemen pengajaran dan penilaian hingga perapotan sehingga para guru tidak perlu menjalani proses yang kompleks
        </Paragraph>
        
        {/* Tombol Aksi */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link href='/login'>
          <button className="px-8 py-3 cursor-pointer bg-slate-950 text-white rounded-xl font-medium shadow-sm hover:bg-slate-800 transition active:scale-95">
           Login
          </button>
          </Link>
        </div>
      </main>

    </div>
  );
};

export default ModernWhiteGridBackground;
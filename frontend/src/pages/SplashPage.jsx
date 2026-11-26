import React from 'react';
import { Loader2 } from 'lucide-react';

export function SplashPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, #ddeeff 0%, #f5f9ff 42%, #eef5ff 74%, #1152d4 74%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Emblem + Title + Student Illustration */}
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '44px 20px 0',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 2,
        }}
      >
        {/* Graduation Cap Over Open Book Emblem */}
        <svg width="96" height="72" viewBox="0 0 120 88" fill="none" aria-hidden="true" style={{ marginBottom: 8 }}>
          <path d="M60 10L18 28L60 44L102 28L60 10Z" fill="#10367A" />
          <path d="M36 36V50C36 55 47 60 60 60C73 60 84 55 84 50V36L60 46L36 36Z" fill="#1A4FA3" />
          <path d="M96 30V48" stroke="#FBBF24" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="96" cy="50" r="4" fill="#FBBF24" />
          <path d="M16 52C31 48 47 52 60 62C73 52 89 48 104 52V78C89 74 73 76 60 84C47 76 31 74 16 78V52Z" fill="#1E64F0" />
          <path d="M22 55C34 52 48 56 58 64V79C47 73 34 71 22 74V55Z" fill="#EBF4FF" />
          <path d="M98 55C86 52 72 56 62 64V79C73 73 86 71 98 74V55Z" fill="#EBF4FF" />
        </svg>

        <h1
          style={{
            margin: 0,
            fontSize: '1.9rem',
            lineHeight: 1.15,
            fontWeight: 800,
            color: '#0f214d',
            letterSpacing: '-0.02em',
          }}
        >
          10<sup style={{ fontSize: '0.62em' }}>th</sup> Class
          <br />
          Learning Hub
        </h1>
        <p
          style={{
            margin: '8px 0 14px',
            fontSize: '0.92rem',
            fontWeight: 700,
            color: '#1e429f',
            letterSpacing: '0.02em',
          }}
        >
          Learn &bull; Practice &bull; Excel
        </p>

        <img
          src="/illustrations/splash-students.jpg"
          alt="Class 10 students ready to learn"
          style={{
            width: '100%',
            maxWidth: 280,
            height: 225,
            objectFit: 'cover',
            objectPosition: 'center top',
            borderRadius: '26px 26px 0 0',
            mixBlendMode: 'multiply',
            marginBottom: -14,
          }}
        />
      </div>

      {/* Bottom Royal Blue Wave with Golden Ribbon (Exact Screen 1 Footer) */}
      <div
        style={{
          width: '100%',
          background: 'linear-gradient(180deg, #1049c7 0%, #0b3aa3 100%)',
          color: '#fff',
          textAlign: 'center',
          position: 'relative',
          padding: '28px 20px calc(26px + env(safe-area-inset-bottom, 0px))',
          borderTopLeftRadius: '50% 26px',
          borderTopRightRadius: '50% 26px',
          borderTop: '7px solid #f5b91a',
          zIndex: 3,
        }}
      >
        <div
          style={{
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: '1.02rem',
            lineHeight: 1.35,
            marginBottom: 16,
            opacity: 0.96,
          }}
        >
          Your Success
          <br />
          Our Mission...
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Loader2 size={28} color="#ffffff" className="spin-loader" />
          <span style={{ fontSize: '0.84rem', fontWeight: 600, opacity: 0.9 }}>Loading...</span>
        </div>
      </div>
    </div>
  );
}

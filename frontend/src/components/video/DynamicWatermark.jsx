import React, { useEffect, useState } from 'react';

// Safe zones kept away from the bottom 25% so YouTube's official controls & branding are never obstructed
const POSITIONS = [
  { top: '8%', left: '6%' },
  { top: '10%', left: '52%' },
  { top: '38%', left: '14%' },
  { top: '36%', left: '54%' },
  { top: '20%', left: '28%' },
];

export function DynamicWatermark({ watermark }) {
  const [posIndex, setPosIndex] = useState(0);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const moveTimer = setInterval(() => {
      setPosIndex((prev) => (prev + 1) % POSITIONS.length);
      setClock(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    }, 18000);
    return () => clearInterval(moveTimer);
  }, []);

  if (!watermark) return null;

  const pos = POSITIONS[posIndex];
  const label = [watermark.studentCode, watermark.identifier, clock].filter(Boolean).join(' • ');

  return (
    <div
      className="lms-watermark"
      data-testid="student-watermark"
      aria-hidden="true"
      style={{ top: pos.top, left: pos.left }}
    >
      {label}
    </div>
  );
}

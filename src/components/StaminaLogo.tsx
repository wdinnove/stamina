export function StaminaLogo({ size = 32 }: { size?: number }) {
  const r = Math.round(size * 0.25);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx={r} fill="#0D0F14" />
      <rect width="32" height="32" rx={r} fill="url(#sg)" fillOpacity="0.12" />
      <polyline points="2,18 7,18 9,12 11,22 14,10 16,20 18,16 21,16 23,18 30,18"
        stroke="#00E5A0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.55" />
      <text x="16" y="22" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif"
        fontWeight="900" fontSize="16" fill="#00E5A0" letterSpacing="-0.5">S</text>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5A0" />
          <stop offset="100%" stopColor="#0D0F14" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface TraceaLogoProps {
  size?: number;
  className?: string;
}

export function TraceaLogo({ size = 36, className }: TraceaLogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-label="TRACEA"
    >
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#185FA5" />
      <rect x="26" y="2" width="20" height="20" rx="4" fill="#185FA5" />
      <rect x="2" y="26" width="20" height="20" rx="4" fill="#185FA5" />
      <rect x="26" y="26" width="20" height="20" rx="4" fill="#8587E8" />
      <line x1="22" y1="22" x2="26" y2="26" stroke="white" strokeWidth="2" strokeDasharray="2,2" />
      <polyline
        points="32,36 35,39 42,32"
        stroke="white"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

"use client";

export function Bench({
  onSit,
  isSeated,
}: {
  onSit: () => void;
  isSeated: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSit}
      className="absolute left-1/2 top-[54%] z-20 w-[min(72vw,560px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/40"
      aria-label={isSeated ? "Stand up from the bench" : "Sit on the bench"}
    >
      <svg
        viewBox="0 0 560 220"
        className="h-auto w-full drop-shadow-[0_18px_28px_rgba(40,50,30,0.28)]"
      >
        <ellipse
          cx="280"
          cy="198"
          rx="210"
          ry="16"
          fill="rgba(40,55,30,0.18)"
        />
        <rect x="70" y="78" width="420" height="22" rx="6" fill="#7a5130" />
        <rect x="62" y="104" width="436" height="28" rx="7" fill="#8b5a33" />
        <rect x="54" y="136" width="452" height="18" rx="5" fill="#6e4426" />
        <rect x="92" y="154" width="18" height="42" rx="4" fill="#5a3520" />
        <rect x="450" y="154" width="18" height="42" rx="4" fill="#5a3520" />
        <rect x="170" y="154" width="16" height="36" rx="4" fill="#5a3520" />
        <rect x="374" y="154" width="16" height="36" rx="4" fill="#5a3520" />
        <path
          d="M78 78 C110 42, 170 34, 210 52 C240 28, 300 24, 340 48 C390 30, 450 40, 482 78 Z"
          fill="#6f4828"
          opacity="0.95"
        />
        <path
          d="M96 78 C120 54, 170 48, 210 62 C250 44, 310 42, 348 60 C390 48, 440 56, 464 78 Z"
          fill="#9a6840"
        />
      </svg>
      <span className="sr-only">{isSeated ? "Stand up" : "Sit and talk"}</span>
    </button>
  );
}

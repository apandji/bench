"use client";

export function ParkAtmosphere() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="park-sky absolute inset-0" />
      <div className="park-haze absolute inset-x-0 top-0 h-[55%]" />
      <div className="park-grass absolute inset-x-0 bottom-0 h-[48%]" />
      <div className="park-grass-grain absolute inset-x-0 bottom-0 h-[48%] opacity-40" />

      <svg
        className="absolute bottom-[34%] left-[-4%] h-[42%] w-[34%] text-[var(--canopy)] opacity-90"
        viewBox="0 0 220 260"
        fill="currentColor"
      >
        <ellipse cx="110" cy="110" rx="96" ry="88" className="tree-sway" />
        <rect x="100" y="160" width="18" height="90" rx="4" fill="#5a3a24" />
      </svg>
      <svg
        className="absolute bottom-[38%] right-[-2%] h-[48%] w-[38%] text-[var(--canopy-deep)] opacity-95"
        viewBox="0 0 240 280"
        fill="currentColor"
      >
        <ellipse
          cx="120"
          cy="120"
          rx="108"
          ry="96"
          className="tree-sway-slow"
        />
        <rect x="110" y="175" width="20" height="100" rx="4" fill="#4b311f" />
      </svg>
      <svg
        className="absolute bottom-[42%] left-[28%] h-[28%] w-[18%] text-[var(--canopy)] opacity-70"
        viewBox="0 0 160 200"
        fill="currentColor"
      >
        <ellipse cx="80" cy="80" rx="70" ry="64" className="tree-sway" />
        <rect x="72" y="120" width="14" height="70" rx="3" fill="#5a3a24" />
      </svg>

      <div className="leaf leaf-a" />
      <div className="leaf leaf-b" />
      <div className="leaf leaf-c" />
    </div>
  );
}

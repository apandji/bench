"use client";

import { PerfectCursor } from "perfect-cursors";
import { useCallback, useEffect, useRef, useState } from "react";
import { maxHp, type CombatState, type PresenceUser } from "../lib/types";
import { getCursorTransform } from "../lib/presence";

export function LocalPresence({
  combat,
  isPunching,
  point,
  user,
}: {
  combat?: CombatState;
  isPunching: boolean;
  point: [number, number];
  user: PresenceUser;
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-40 select-none will-change-transform"
      style={{ transform: getCursorTransform(point) }}
    >
      <PresenceMarker
        combat={combat}
        isPunching={isPunching}
        user={user}
        isSelf
      />
    </div>
  );
}

export function RemoteCursor({
  combat,
  point,
  user,
}: {
  combat?: CombatState;
  point: [number, number];
  user: PresenceUser;
}) {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const perfectCursorRef = useRef<PerfectCursor | null>(null);
  const [x, y] = point;
  const [initialPoint] = useState(() => [x, y]);
  const isSeated = Boolean(user.seated);
  const isSeatedRef = useRef(isSeated);

  const setTransform = useCallback((nextPoint: number[]) => {
    const cursor = cursorRef.current;
    if (cursor) {
      cursor.style.transform = getCursorTransform(nextPoint);
    }
  }, []);

  const moveCursor = useCallback(
    (nextPoint: number[]) => {
      // A glide still in flight from before sitting must not pull the
      // seated figure off the bench.
      if (!isSeatedRef.current) {
        setTransform(nextPoint);
      }
    },
    [setTransform],
  );

  useEffect(() => {
    const perfectCursor = new PerfectCursor(moveCursor);
    perfectCursorRef.current = perfectCursor;
    perfectCursor.addPoint(initialPoint);

    return () => {
      perfectCursor.dispose();
      perfectCursorRef.current = null;
    };
  }, [initialPoint, moveCursor]);

  useEffect(() => {
    isSeatedRef.current = isSeated;
    if (isSeated) {
      // Sitting is a jump, not a glide: snap straight onto the seat.
      setTransform([x, y]);
      return;
    }

    perfectCursorRef.current?.addPoint([x, y]);
  }, [isSeated, setTransform, x, y]);

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none absolute left-0 top-0 z-30 select-none will-change-transform"
      style={{ transform: getCursorTransform(initialPoint) }}
    >
      <PresenceMarker combat={combat} user={user} />
    </div>
  );
}

function PresenceMarker({
  combat,
  isPunching = false,
  isSelf = false,
  user,
}: {
  combat?: CombatState;
  isPunching?: boolean;
  isSelf?: boolean;
  user: PresenceUser;
}) {
  const typing = user.typing?.trim();
  const label = isSelf ? `${user.name} (you)` : user.name;
  const lastHit = combat?.lastHit;

  const overhead = (
    <div className="flex flex-col items-center gap-2">
      {typing ? (
        <div className="speech-bubble relative min-w-[3rem] max-w-[14rem] px-3 py-2 text-left">
          <p className="break-words font-[family-name:var(--font-body)] text-[13px] leading-snug text-[var(--ink)]">
            {typing}
            <span className="typing-caret" aria-hidden="true">
              |
            </span>
          </p>
        </div>
      ) : null}
      {/* Your own HP lives in the HUD corner, Pokémon style. */}
      {!isSelf && (combat || user.ghost) ? (
        <HealthBar name={user.name} hp={user.hp ?? maxHp} ghost={user.ghost} />
      ) : null}
    </div>
  );

  const damage = lastHit ? (
    <span
      key={lastHit.key}
      className="damage-pop absolute -top-3 left-6 font-[family-name:var(--font-display)] text-xl font-bold text-[#c0392b]"
    >
      {lastHit.ko ? "KO!" : `-${lastHit.damage}`}
    </span>
  ) : null;

  if (user.seated) {
    // Anchor the sitting figure's hips on the seat point.
    return (
      <div className="relative">
        <div className="absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center">
          <div className="mb-2">{overhead}</div>
          <div
            className="mb-1 max-w-[7rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: user.color }}
          >
            {label}
          </div>
          <SittingFigure color={user.color} />
        </div>
      </div>
    );
  }

  return (
    <div
      key={lastHit?.key}
      className={`relative ${lastHit ? "hit-shake" : ""}`}
    >
      <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-10 -translate-x-1/2">
        {overhead}
      </div>

      {damage}

      {user.ghost ? (
        <GhostIcon />
      ) : (
        <svg
          aria-hidden="true"
          className={`h-[30px] w-[30px] overflow-visible drop-shadow-[0_6px_12px_rgba(29,28,24,0.22)] ${isPunching ? "cursor-punch" : ""}`}
          viewBox="0 0 18 18"
          fill="none"
        >
          <path
            d="M5.6538 12.3673H5.4603L5.3172 12.4976L0.5 16.8829V1.1984L11.7841 12.3673H5.6538Z"
            fill={user.color}
            stroke="white"
            strokeLinejoin="round"
            strokeWidth="1.35"
          />
        </svg>
      )}
      <div
        className={`absolute left-[12px] top-[25px] max-w-40 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-white/35 px-2.5 py-0.5 text-[12px] font-semibold leading-5 text-white shadow-[0_8px_18px_rgba(29,28,24,0.2)] ${user.ghost ? "opacity-60" : ""}`}
        style={{ backgroundColor: user.color }}
      >
        {label}
      </div>
    </div>
  );
}

function SittingFigure({ color }: { color: string }) {
  // Hips sit at the bottom edge so the figure rests on the seat plank.
  return (
    <svg
      width="34"
      height="40"
      viewBox="0 0 34 40"
      aria-hidden="true"
      className="drop-shadow-[0_4px_6px_rgba(29,28,24,0.25)]"
    >
      <circle cx="17" cy="9" r="7.5" fill={color} stroke="white" strokeWidth="2" />
      <path
        d="M6 39 C6 24, 28 24, 28 39 Z"
        fill={color}
        stroke="white"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GhostIcon() {
  return (
    <svg
      aria-hidden="true"
      className="ghost-float h-[34px] w-[30px] overflow-visible opacity-80 drop-shadow-[0_6px_12px_rgba(29,28,24,0.18)]"
      viewBox="0 0 30 34"
    >
      <path
        d="M3 15 C3 7, 8 2, 15 2 C22 2, 27 7, 27 15 L27 32 L23 28 L19 32 L15 28 L11 32 L7 28 L3 32 Z"
        fill="#f7f7f2"
        stroke="#9aa3a0"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="14" r="2.2" fill="#2b2d2a" />
      <circle cx="19" cy="14" r="2.2" fill="#2b2d2a" />
    </svg>
  );
}

export function HealthBar({
  ghost,
  hp,
  isSelf = false,
  name,
}: {
  ghost?: boolean;
  hp: number;
  isSelf?: boolean;
  name: string;
}) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const barColor =
    ratio > 0.5 ? "#3fbf5f" : ratio > 0.2 ? "#f2c230" : "#e0473a";

  return (
    <div
      className={`hp-card px-2 py-1.5 ${isSelf ? "w-[13rem]" : "w-[9.5rem]"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-bold uppercase tracking-wide text-[#2b2d2a]">
          {name}
        </span>
        <span className="shrink-0 text-[10px] font-semibold text-[#2b2d2a]">
          {ghost ? "FAINTED" : `${hp}/${maxHp}`}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="rounded-sm bg-[#2b2d2a] px-1 text-[9px] font-bold leading-3 text-[#f2c230]">
          HP
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-[#2b2d2a]/40 bg-[#e8e4d8]">
          <div
            className="h-full rounded-full transition-[width,background-color] duration-300"
            style={{ width: `${ratio * 100}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
    </div>
  );
}

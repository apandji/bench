"use client";

import { PerfectCursor } from "perfect-cursors";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardSize, PresenceUser } from "../lib/types";
import { getCursorTransform } from "../lib/presence";

export function LocalPresence({
  boardSize,
  user,
}: {
  boardSize: BoardSize;
  user: PresenceUser;
}) {
  const { width, height } = boardSize;
  const left = user.x * width;
  const top = user.y * height;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-40 select-none will-change-transform"
      style={{
        transform: `translate3d(${left}px, ${top}px, 0) translate(-1px, -2px)`,
      }}
    >
      <PresenceMarker user={user} isSelf />
    </div>
  );
}

export function RemoteCursor({
  boardSize,
  user,
}: {
  boardSize: BoardSize;
  user: PresenceUser;
}) {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const perfectCursorRef = useRef<PerfectCursor | null>(null);
  const { height, width } = boardSize;
  const { x, y } = user;
  const [initialPoint] = useState(() => [x * width, y * height]);

  const moveCursor = useCallback((point: number[]) => {
    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }

    cursor.style.transform = getCursorTransform(point);
  }, []);

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
    perfectCursorRef.current?.addPoint([x * width, y * height]);
  }, [height, width, x, y]);

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none absolute left-0 top-0 z-30 select-none will-change-transform"
      style={{ transform: getCursorTransform(initialPoint) }}
    >
      <PresenceMarker user={user} />
    </div>
  );
}

function PresenceMarker({
  user,
  isSelf = false,
}: {
  user: PresenceUser;
  isSelf?: boolean;
}) {
  const typing = user.typing?.trim();

  return (
    <div className="relative">
      {typing ? (
        <div className="speech-bubble absolute bottom-[calc(100%+10px)] left-1/2 z-10 min-w-[3rem] max-w-[14rem] -translate-x-1/2 px-3 py-2 text-left">
          <p className="break-words font-[family-name:var(--font-body)] text-[13px] leading-snug text-[var(--ink)]">
            {typing}
            <span className="typing-caret" aria-hidden="true">
              |
            </span>
          </p>
        </div>
      ) : null}

      {user.seated ? (
        <div className="relative flex flex-col items-center">
          <div
            className="mb-1 max-w-[7rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: user.color }}
          >
            {isSelf ? `${user.name} (you)` : user.name}
          </div>
          <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">
            <circle
              cx="17"
              cy="10"
              r="8"
              fill={user.color}
              stroke="white"
              strokeWidth="2"
            />
            <path
              d="M8 38 C8 24, 26 24, 26 38"
              fill={user.color}
              stroke="white"
              strokeWidth="2"
            />
          </svg>
        </div>
      ) : (
        <>
          <svg
            aria-hidden="true"
            className="h-[30px] w-[30px] overflow-visible drop-shadow-[0_6px_12px_rgba(29,28,24,0.22)]"
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
          <div
            className="absolute left-[12px] top-[25px] max-w-40 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-white/35 px-2.5 py-0.5 text-[12px] font-semibold leading-5 text-white shadow-[0_8px_18px_rgba(29,28,24,0.2)]"
            style={{ backgroundColor: user.color }}
          >
            {isSelf ? `${user.name} (you)` : user.name}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import type { PointerEvent, RefObject } from "react";
import { Bench } from "./bench";
import { LocalPresence, RemoteCursor } from "./cursors";
import { ParkAtmosphere } from "./park-atmosphere";
import { colors, type BoardSize, type PresenceUser } from "../lib/types";
import { statusClassName, statusLabel } from "../lib/presence";

type ParkShellProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  boardSize: BoardSize;
  connectionState: "connecting" | "open" | "closed";
  draft: string;
  isSeated: boolean;
  notice: string | null;
  otherUsers: PresenceUser[];
  seatedCount: number;
  self: PresenceUser;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onSit: () => void;
  onStand: () => void;
  onUpdateName: (name: string) => void;
  onUpdateColor: (color: string) => void;
};

export function ParkShell({
  boardRef,
  boardSize,
  connectionState,
  draft,
  isSeated,
  notice,
  otherUsers,
  seatedCount,
  self,
  onPointerMove,
  onSit,
  onStand,
  onUpdateName,
  onUpdateColor,
}: ParkShellProps) {
  return (
    <main className="park-root relative min-h-screen overflow-hidden text-[var(--ink)]">
      <div
        ref={boardRef}
        className="relative h-dvh w-full cursor-none"
        onPointerMove={onPointerMove}
      >
        <ParkAtmosphere />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-5 pt-6 md:px-10 md:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.9] tracking-[-0.04em] text-[var(--ink)]">
                Park Bench
              </p>
              <p className="mt-3 max-w-sm font-[family-name:var(--font-body)] text-sm text-[var(--ink-soft)] md:text-base">
                Wander the lawn, sit down, and talk in real time. What you type
                appears above your cursor.
              </p>
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <span className={statusClassName(connectionState)}>
                {statusLabel(connectionState)}
              </span>
              <p className="font-[family-name:var(--font-body)] text-xs text-[var(--ink-soft)]">
                {otherUsers.length + 1} here · {seatedCount} seated
              </p>
            </div>
          </div>
        </header>

        <Bench onSit={isSeated ? onStand : onSit} isSeated={isSeated} />

        <LocalPresence
          boardSize={boardSize}
          user={{
            ...self,
            typing: draft || self.typing,
          }}
        />

        {otherUsers.map((user) => (
          <RemoteCursor key={user.id} boardSize={boardSize} user={user} />
        ))}

        <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-5 pb-5 md:px-10 md:pb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="pointer-events-auto max-w-md rounded-sm bg-[color-mix(in_oklab,var(--paper)_82%,transparent)] px-4 py-3 shadow-[0_12px_40px_rgba(28,40,28,0.12)] backdrop-blur-sm">
              <p className="font-[family-name:var(--font-body)] text-sm text-[var(--ink)]">
                {isSeated
                  ? "You are seated. Type to talk. Esc stands up."
                  : "Click the bench or start typing to sit and chat."}
              </p>
              {draft ? (
                <p className="mt-1 truncate font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                  {draft}
                  <span className="typing-caret" aria-hidden="true">
                    |
                  </span>
                </p>
              ) : null}
              {notice ? (
                <p className="mt-1 text-sm text-[#8a3b2b]">{notice}</p>
              ) : null}
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-sm bg-[color-mix(in_oklab,var(--paper)_82%,transparent)] px-3 py-2 backdrop-blur-sm">
              <label className="flex items-center gap-2 font-[family-name:var(--font-body)] text-sm text-[var(--ink-soft)]">
                You
                <input
                  className="h-8 w-28 border border-[var(--line)] bg-[var(--paper)] px-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                  value={self.name}
                  onChange={(event) => onUpdateName(event.target.value)}
                />
              </label>
              <div className="flex items-center gap-1" aria-label="Cursor color">
                {colors.map((color) => (
                  <button
                    key={color}
                    className="size-6 border border-black/10 outline-none transition hover:scale-105 focus:ring-2 focus:ring-[var(--ink)]/30"
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        self.color === color
                          ? "inset 0 0 0 2px white"
                          : undefined,
                    }}
                    type="button"
                    aria-label={`Use ${color}`}
                    onClick={() => onUpdateColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

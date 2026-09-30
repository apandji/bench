"use client";

import {
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Bench } from "./bench";
import { HealthBar, LocalPresence, RemoteCursor } from "./cursors";
import { IdeaBox } from "./idea-box";
import { ParkAtmosphere } from "./park-atmosphere";
import {
  attackRadiusPx,
  colors,
  maxHp,
  type BoardSize,
  type CombatState,
  type Idea,
  type PresenceUser,
} from "../lib/types";
import {
  type BenchRect,
  getUserPoint,
  statusClassName,
  statusLabel,
} from "../lib/presence";

type ParkShellProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  boardSize: BoardSize;
  combat: Record<string, CombatState>;
  connectionState: "connecting" | "open" | "closed";
  draft: string;
  ideas: Idea[];
  isFightActive: boolean;
  isIdeaBoxOpen: boolean;
  isMusicMuted: boolean;
  isPunching: boolean;
  isSeated: boolean;
  notice: string | null;
  otherUsers: PresenceUser[];
  seatedCount: number;
  self: PresenceUser;
  onAttack: (targetId: string, x: number, y: number) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onSit: () => void;
  onStand: () => void;
  onSubmitIdea: (text: string) => Promise<string | null>;
  onToggleIdeaBox: () => void;
  onToggleMusic: () => void;
  onUpdateName: (name: string) => void;
  onUpdateColor: (color: string) => void;
};

const interactiveSelector = "button, input, textarea, select, a, label";

export function ParkShell({
  boardRef,
  boardSize,
  combat,
  connectionState,
  draft,
  ideas,
  isFightActive,
  isIdeaBoxOpen,
  isMusicMuted,
  isPunching,
  isSeated,
  notice,
  otherUsers,
  seatedCount,
  self,
  onAttack,
  onPointerMove,
  onSit,
  onStand,
  onSubmitIdea,
  onToggleIdeaBox,
  onToggleMusic,
  onUpdateName,
  onUpdateColor,
}: ParkShellProps) {
  const benchRef = useRef<HTMLButtonElement | null>(null);
  const [bench, setBench] = useState<BenchRect | null>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const benchElement = benchRef.current;
    if (!board || !benchElement) {
      return;
    }

    const measure = () => {
      const boardRect = board.getBoundingClientRect();
      const benchRect = benchElement.getBoundingClientRect();
      const next = {
        left: benchRect.left - boardRect.left,
        top: benchRect.top - boardRect.top,
        width: benchRect.width,
        height: benchRect.height,
      };
      setBench((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };

    measure();

    // The bench can resize on its own (styles/fonts settling), not just the board.
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    observer.observe(benchElement);
    return () => observer.disconnect();
  }, [boardRef, boardSize]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    const target = event.target as HTMLElement | null;
    if (
      !board ||
      event.button !== 0 ||
      isSeated ||
      self.ghost ||
      target?.closest(interactiveSelector)
    ) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    let closest: { id: string; distance: number } | null = null;
    for (const user of otherUsers) {
      if (user.seated || user.ghost) {
        continue;
      }

      const [x, y] = getUserPoint(user, boardSize, bench);
      const distance = Math.hypot(x - clickX, y - clickY);
      if (distance <= attackRadiusPx && (!closest || distance < closest.distance)) {
        closest = { id: user.id, distance };
      }
    }

    if (closest) {
      onAttack(closest.id, clickX / rect.width, clickY / rect.height);
    }
  };

  const selfWithDraft = { ...self, typing: draft || self.typing };

  return (
    <main className="park-root relative min-h-screen overflow-hidden text-[var(--ink)]">
      <div
        ref={boardRef}
        className={`relative h-dvh w-full ${isSeated ? "" : "cursor-none"}`}
        onPointerMove={onPointerMove}
        onPointerDown={handlePointerDown}
      >
        <ParkAtmosphere />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-5 pt-6 md:px-10 md:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.9] tracking-[-0.04em] text-[var(--ink)]">
                Park Bench
              </p>
              <p className="mt-3 max-w-sm font-[family-name:var(--font-body)] text-sm text-[var(--ink-soft)] md:text-base">
                Wander the lawn, sit down, and talk in real time. Click
                another wanderer to pick a fight. The bench is a safe zone.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className={statusClassName(connectionState)}>
                {statusLabel(connectionState)}
              </span>
              <p className="font-[family-name:var(--font-body)] text-xs text-[var(--ink-soft)]">
                {otherUsers.length + 1} here · {seatedCount} seated
              </p>
              <button
                type="button"
                onClick={onToggleMusic}
                aria-pressed={!isMusicMuted}
                className="pointer-events-auto h-7 border border-[var(--line)] bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] px-2.5 font-[family-name:var(--font-body)] text-xs text-[var(--ink)] backdrop-blur-sm transition hover:bg-[var(--paper)]"
              >
                {isMusicMuted
                  ? "Battle music: off"
                  : isFightActive
                    ? "♪ Battle music: on"
                    : "Battle music: on"}
              </button>
              <IdeaBox
                ideas={ideas}
                isOpen={isIdeaBoxOpen}
                onSubmit={onSubmitIdea}
                onToggle={onToggleIdeaBox}
              />
            </div>
          </div>
        </header>

        <Bench
          ref={benchRef}
          onSit={isSeated ? onStand : onSit}
          isSeated={isSeated}
        />

        {combat[self.id] || self.ghost ? (
          <div className="pointer-events-none absolute bottom-28 right-5 z-30 md:bottom-32 md:right-10">
            <HealthBar
              name={self.name}
              hp={self.hp ?? maxHp}
              ghost={self.ghost}
              isSelf
            />
          </div>
        ) : null}

        <LocalPresence
          combat={combat[self.id]}
          isPunching={isPunching}
          point={getUserPoint(selfWithDraft, boardSize, bench)}
          user={selfWithDraft}
        />

        {otherUsers.map((user) => (
          <RemoteCursor
            key={user.id}
            combat={combat[user.id]}
            point={getUserPoint(user, boardSize, bench)}
            user={user}
          />
        ))}

        <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-5 pb-5 md:px-10 md:pb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="pointer-events-auto max-w-md rounded-sm bg-[color-mix(in_oklab,var(--paper)_82%,transparent)] px-4 py-3 shadow-[0_12px_40px_rgba(28,40,28,0.12)] backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-[family-name:var(--font-body)] text-sm text-[var(--ink)]">
                  {self.ghost
                    ? "You fainted. Drifting as a ghost until you respawn…"
                    : isSeated
                      ? "You're on the bench. Type to talk, Enter clears your bubble."
                      : "Start typing to sit and talk, or click the bench."}
                </p>
                {isSeated ? (
                  <button
                    type="button"
                    onClick={onStand}
                    className="h-7 shrink-0 border border-[var(--line)] bg-[var(--paper)] px-2.5 font-[family-name:var(--font-body)] text-xs font-medium text-[var(--ink)] transition hover:border-[var(--ink)]"
                  >
                    Stand up · Esc
                  </button>
                ) : null}
              </div>
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

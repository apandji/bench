export type PresenceUser = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
  typing?: string;
  seated?: boolean;
  seat?: number | null;
  hp?: number;
  ghost?: boolean;
};

export type Idea = {
  text: string;
  author: string;
  createdAt: number;
};

export type HitEvent = {
  damage: number;
  ko: boolean;
  key: number;
};

export type CombatState = {
  /** Local clock (ms) until which this user is shown as fighting. */
  until: number;
  lastHit?: HitEvent;
};

export type BoardSize = {
  width: number;
  height: number;
};

export type SocketMessage =
  | { type: "snapshot"; selfId: string; users: PresenceUser[] }
  | { type: "presence"; user: PresenceUser }
  | { type: "cursor"; user: PresenceUser }
  | { type: "typing"; user: PresenceUser }
  | { type: "sit_denied"; reason: string }
  | {
      type: "hit";
      attacker: PresenceUser;
      target: PresenceUser;
      damage: number;
      ko: boolean;
    }
  | { type: "idea"; idea: Idea }
  | { type: "leave"; id: string };

export const colors = [
  "#2f6f4e",
  "#c45c26",
  "#1f6f8b",
  "#b33b5a",
  "#6b4f2c",
  "#3d6b3a",
  "#8b4513",
  "#2c5f7a",
];
export const names = [
  "Mira",
  "Kai",
  "Rin",
  "Avery",
  "Noor",
  "Sol",
  "Ira",
  "Jules",
];
export const sessionUserKey = "park-bench-session-user";
export const musicMutedKey = "park-bench-music-muted";
export const cursorSendIntervalMs = 80;
export const typingSendIntervalMs = 100;
export const maxHp = 100;
export const battleDurationMs = 8000;
/** Pixel radius around a click that counts as hitting another cursor. */
export const attackRadiusPx = 56;
/** Seat centers as fractions of the bench artwork (viewBox 560x220). */
export const benchSeatX = [0.22, 0.36, 0.5, 0.64, 0.78];
export const benchSeatY = 0.5;

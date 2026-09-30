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
export const cursorSendIntervalMs = 80;
export const typingSendIntervalMs = 100;

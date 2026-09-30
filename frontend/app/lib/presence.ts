import type { BoardSize, PresenceUser, SocketMessage } from "./types";
import {
  benchSeatX,
  benchSeatY,
  colors,
  names,
  sessionUserKey,
} from "./types";

export type BenchRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Where a user is drawn, in board pixels. Seated users sit on the bench. */
export function getUserPoint(
  user: PresenceUser,
  boardSize: BoardSize,
  bench: BenchRect | null,
): [number, number] {
  if (user.seated && typeof user.seat === "number" && bench) {
    const seatX = benchSeatX[user.seat] ?? 0.5;
    return [
      bench.left + bench.width * seatX,
      bench.top + bench.height * benchSeatY,
    ];
  }

  return [user.x * boardSize.width, user.y * boardSize.height];
}

function serverBaseUrl() {
  return (process.env.NEXT_PUBLIC_WS_URL ?? "/server").replace(/\/$/, "");
}

export function createApiUrl(path: string) {
  return new URL(`${serverBaseUrl()}${path}`, window.location.origin).toString();
}

export function getCursorTransform(point: number[]) {
  return `translate3d(${point[0]}px, ${point[1]}px, 0) translate(-1px, -2px)`;
}

export function createLocalUser(): PresenceUser {
  const savedUser = sessionStorage.getItem(sessionUserKey);
  if (savedUser) {
    try {
      const parsedUser = JSON.parse(savedUser) as Partial<PresenceUser>;
      if (parsedUser.id && parsedUser.name && parsedUser.color) {
        return {
          id: parsedUser.id,
          name: parsedUser.name,
          color: parsedUser.color,
          x: 0.48 + Math.random() * 0.04,
          y: 0.58 + Math.random() * 0.08,
          updatedAt: Date.now() / 1000,
          typing: "",
          seated: false,
          seat: null,
        };
      }
    } catch {
      sessionStorage.removeItem(sessionUserKey);
    }
  }

  const randomIndex = Math.floor(Math.random() * names.length);
  return {
    id: crypto.randomUUID(),
    name: names[randomIndex],
    color: colors[randomIndex % colors.length],
    x: 0.48 + Math.random() * 0.04,
    y: 0.58 + Math.random() * 0.08,
    updatedAt: Date.now() / 1000,
    typing: "",
    seated: false,
    seat: null,
  };
}

export function defaultUser(): PresenceUser {
  return {
    id: "pending",
    name: "Visitor",
    color: colors[0],
    x: 0.5,
    y: 0.5,
    updatedAt: 0,
    typing: "",
    seated: false,
    seat: null,
  };
}

export function createWebSocketUrl(
  user: Pick<PresenceUser, "id" | "name" | "color">,
) {
  const url = new URL(`${serverBaseUrl()}/ws`, window.location.origin);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("id", user.id);
  url.searchParams.set("name", user.name);
  url.searchParams.set("color", user.color);

  return url.toString();
}

export function parseSocketMessage(data: string): SocketMessage | null {
  try {
    const message = JSON.parse(data) as SocketMessage;
    return typeof message === "object" && message !== null ? message : null;
  } catch {
    return null;
  }
}

export function reducePresence(
  currentUsers: Record<string, PresenceUser>,
  message: SocketMessage,
  selfId: string,
) {
  if (message.type === "snapshot") {
    return Object.fromEntries(message.users.map((user) => [user.id, user]));
  }

  if (
    message.type === "presence" ||
    message.type === "cursor" ||
    message.type === "typing"
  ) {
    return { ...currentUsers, [message.user.id]: message.user };
  }

  if (message.type === "hit") {
    return {
      ...currentUsers,
      [message.attacker.id]: {
        ...currentUsers[message.attacker.id],
        ...message.attacker,
      },
      [message.target.id]: message.target,
    };
  }

  if (message.type === "leave" && message.id !== selfId) {
    const nextUsers = { ...currentUsers };
    delete nextUsers[message.id];
    return nextUsers;
  }

  return currentUsers;
}

export function statusLabel(connectionState: "connecting" | "open" | "closed") {
  if (connectionState === "open") {
    return "Live";
  }

  if (connectionState === "connecting") {
    return "Connecting";
  }

  return "Reconnecting";
}

export function statusClassName(
  connectionState: "connecting" | "open" | "closed",
) {
  const baseClassName =
    "inline-flex h-8 items-center border px-3 font-[family-name:var(--font-body)] text-xs font-medium";

  if (connectionState === "open") {
    return `${baseClassName} border-[#4f7d57] bg-[#e5f0e4] text-[#23452c]`;
  }

  if (connectionState === "connecting") {
    return `${baseClassName} border-[#b59a4a] bg-[#f4ebc8] text-[#6a5418]`;
  }

  return `${baseClassName} border-[#c98c82] bg-[#f3ddd6] text-[#7a2e25]`;
}

export function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

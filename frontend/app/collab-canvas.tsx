"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ParkShell } from "./components/park-shell";
import {
  cursorSendIntervalMs,
  sessionUserKey,
  typingSendIntervalMs,
  type BoardSize,
  type PresenceUser,
} from "./lib/types";
import {
  clamp,
  createLocalUser,
  createWebSocketUrl,
  defaultUser,
  parseSocketMessage,
  reducePresence,
} from "./lib/presence";

export function ParkBench() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(800);
  const lastSentAtRef = useRef(0);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const cursorSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "open" | "closed"
  >("connecting");
  const [boardSize, setBoardSize] = useState<BoardSize>({
    width: 0,
    height: 0,
  });
  const [users, setUsers] = useState<Record<string, PresenceUser>>({});
  const [self, setSelf] = useState<PresenceUser>(defaultUser);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const selfRef = useRef(self);
  const draftRef = useRef(draft);
  const selfId = self.id;
  const selfName = self.name;
  const selfColor = self.color;
  const isSeated = Boolean(self.seated);

  const otherUsers = useMemo(
    () =>
      Object.values(users)
        .filter((user) => user.id !== selfId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [selfId, users],
  );

  const seatedCount = useMemo(() => {
    const othersSeated = Object.values(users).filter(
      (user) => user.id !== selfId && user.seated,
    ).length;
    return othersSeated + (isSeated ? 1 : 0);
  }, [users, selfId, isSeated]);

  useEffect(() => {
    selfRef.current = self;
  }, [self]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelf(createLocalUser());
      setIsReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return;
    }

    const updateBoardSize = () => {
      const rect = board.getBoundingClientRect();
      setBoardSize((currentSize) => {
        if (
          currentSize.width === rect.width &&
          currentSize.height === rect.height
        ) {
          return currentSize;
        }

        return { width: rect.width, height: rect.height };
      });
    };

    updateBoardSize();

    const observer = new ResizeObserver(updateBoardSize);
    observer.observe(board);
    window.addEventListener("resize", updateBoardSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBoardSize);
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    sessionStorage.setItem(
      sessionUserKey,
      JSON.stringify({ id: self.id, name: self.name, color: self.color }),
    );
  }, [isReady, self.id, self.name, self.color]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let cancelled = false;

    const connect = () => {
      const ws = new WebSocket(
        createWebSocketUrl({ id: selfId, name: selfName, color: selfColor }),
      );
      socketRef.current = ws;
      setConnectionState("connecting");

      ws.addEventListener("open", () => {
        reconnectDelayRef.current = 800;
        setConnectionState("open");
        ws.send(
          JSON.stringify({ type: "hello", name: selfName, color: selfColor }),
        );
        if (draftRef.current) {
          ws.send(JSON.stringify({ type: "typing", text: draftRef.current }));
        }
        if (selfRef.current.seated) {
          ws.send(JSON.stringify({ type: "sit", seat: selfRef.current.seat }));
        }
      });

      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const message = parseSocketMessage(event.data);
        if (!message) {
          return;
        }

        if (message.type === "sit_denied") {
          setNotice(message.reason);
          window.setTimeout(() => setNotice(null), 2800);
          return;
        }

        setUsers((currentUsers) =>
          reducePresence(currentUsers, message, selfId),
        );

        if (
          (message.type === "presence" ||
            message.type === "cursor" ||
            message.type === "typing") &&
          message.user.id === selfId
        ) {
          setSelf((current) => ({ ...current, ...message.user }));
        }

        if (message.type === "snapshot") {
          const me = message.users.find((user) => user.id === selfId);
          if (me) {
            setSelf((current) => ({ ...current, ...me }));
          }
        }
      });

      ws.addEventListener("close", () => {
        setConnectionState("closed");

        if (cancelled) {
          return;
        }

        reconnectTimerRef.current = setTimeout(
          connect,
          reconnectDelayRef.current,
        );
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 1.6,
          8000,
        );
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (cursorSendTimerRef.current) {
        clearTimeout(cursorSendTimerRef.current);
      }
      if (typingSendTimerRef.current) {
        clearTimeout(typingSendTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [isReady, selfId, selfName, selfColor]);

  const flushCursor = () => {
    cursorSendTimerRef.current = null;

    const pendingCursor = pendingCursorRef.current;
    const socket = socketRef.current;

    if (
      !pendingCursor ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      selfRef.current.seated
    ) {
      return;
    }

    pendingCursorRef.current = null;
    lastSentAtRef.current = Date.now();

    const nextSelf = {
      ...selfRef.current,
      ...pendingCursor,
      updatedAt: Date.now() / 1000,
    };
    setSelf(nextSelf);
    setUsers((currentUsers) => ({ ...currentUsers, [nextSelf.id]: nextSelf }));
    socket.send(
      JSON.stringify({
        type: "cursor",
        x: pendingCursor.x,
        y: pendingCursor.y,
      }),
    );
  };

  const scheduleCursorSend = (x: number, y: number) => {
    if (selfRef.current.seated) {
      return;
    }

    pendingCursorRef.current = { x, y };

    if (cursorSendTimerRef.current) {
      return;
    }

    const elapsed = Date.now() - lastSentAtRef.current;
    const delay = Math.max(cursorSendIntervalMs - elapsed, 0);

    if (delay === 0) {
      flushCursor();
      return;
    }

    cursorSendTimerRef.current = setTimeout(flushCursor, delay);
  };

  const sendCursor = (event: PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    const socket = socketRef.current;

    if (
      !board ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      selfRef.current.seated
    ) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    scheduleCursorSend(x, y);
  };

  const broadcastTyping = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const send = () => {
      typingSendTimerRef.current = null;
      lastTypingSentRef.current = Date.now();
      const nextSelf = {
        ...selfRef.current,
        typing: text,
        updatedAt: Date.now() / 1000,
      };
      setSelf(nextSelf);
      setUsers((currentUsers) => ({
        ...currentUsers,
        [nextSelf.id]: nextSelf,
      }));
      socket.send(JSON.stringify({ type: "typing", text }));
    };

    const elapsed = Date.now() - lastTypingSentRef.current;
    const delay = Math.max(typingSendIntervalMs - elapsed, 0);

    if (typingSendTimerRef.current) {
      clearTimeout(typingSendTimerRef.current);
    }

    if (delay === 0) {
      send();
      return;
    }

    typingSendTimerRef.current = setTimeout(send, delay);
  }, []);

  const updateDraft = useCallback(
    (next: string) => {
      const clipped = next.slice(0, 120);
      setDraft(clipped);
      broadcastTyping(clipped);
    },
    [broadcastTyping],
  );

  const sitOnBench = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({ type: "sit" }));
  }, []);

  const standUp = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    setDraft("");
    socket.send(JSON.stringify({ type: "stand" }));
    const nextSelf = {
      ...selfRef.current,
      seated: false,
      seat: null,
      typing: "",
      updatedAt: Date.now() / 1000,
    };
    setSelf(nextSelf);
    setUsers((currentUsers) => ({ ...currentUsers, [nextSelf.id]: nextSelf }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape" && selfRef.current.seated) {
        event.preventDefault();
        standUp();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!selfRef.current.seated) {
          sitOnBench();
        }
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        updateDraft(draftRef.current.slice(0, -1));
        return;
      }

      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        if (!selfRef.current.seated) {
          sitOnBench();
        }
        updateDraft(draftRef.current + event.key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sitOnBench, standUp, updateDraft]);

  const updateName = (name: string) => {
    setSelf((currentSelf) => ({
      ...currentSelf,
      name: name.slice(0, 28) || currentSelf.name,
    }));
  };

  const updateColor = (color: string) => {
    setSelf((currentSelf) => ({ ...currentSelf, color }));
  };

  return (
    <ParkShell
      boardRef={boardRef}
      boardSize={boardSize}
      connectionState={connectionState}
      draft={draft}
      isSeated={isSeated}
      notice={notice}
      otherUsers={otherUsers}
      seatedCount={seatedCount}
      self={self}
      onPointerMove={sendCursor}
      onSit={sitOnBench}
      onStand={standUp}
      onUpdateName={updateName}
      onUpdateColor={updateColor}
    />
  );
}

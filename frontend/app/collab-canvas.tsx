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
import { BattleMusic } from "./lib/battle-music";
import {
  battleDurationMs,
  cursorSendIntervalMs,
  musicMutedKey,
  sessionUserKey,
  typingSendIntervalMs,
  type BoardSize,
  type CombatState,
  type Idea,
  type PresenceUser,
} from "./lib/types";
import {
  clamp,
  createApiUrl,
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
  const [combat, setCombat] = useState<Record<string, CombatState>>({});
  const [isPunching, setIsPunching] = useState(false);
  const punchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isIdeaBoxOpen, setIsIdeaBoxOpen] = useState(false);
  const musicRef = useRef<BattleMusic | null>(null);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const isFightActive = Object.keys(combat).length > 0;
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

  // Drop battle state once a fight has gone quiet so health bars disappear.
  useEffect(() => {
    const deadlines = Object.values(combat).map((entry) => entry.until);
    if (!deadlines.length) {
      return;
    }

    const timer = window.setTimeout(
      () => {
        const now = Date.now();
        setCombat((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([, entry]) => entry.until > now),
          ),
        );
      },
      Math.max(Math.min(...deadlines) - Date.now(), 0) + 50,
    );

    return () => window.clearTimeout(timer);
  }, [combat]);

  useEffect(() => {
    const music = new BattleMusic();
    musicRef.current = music;

    // Browsers only allow audio after a user gesture.
    const unlock = () => music.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      music.dispose();
      musicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setIsMusicMuted(localStorage.getItem(musicMutedKey) === "1");
      } catch {
        // Storage can be unavailable; default to music on.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const music = musicRef.current;
    if (!music) {
      return;
    }

    if (isFightActive && !isMusicMuted) {
      music.start();
    } else {
      music.stop();
    }
  }, [isFightActive, isMusicMuted]);

  const toggleMusic = useCallback(() => {
    setIsMusicMuted((muted) => {
      try {
        localStorage.setItem(musicMutedKey, muted ? "0" : "1");
      } catch {
        // Ignore; the toggle still works for this visit.
      }
      return !muted;
    });
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const controller = new AbortController();
    fetch(createApiUrl("/api/ideas"), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { ideas?: Idea[] } | null) => {
        if (data?.ideas) {
          setIdeas(data.ideas);
        }
      })
      .catch(() => {});

    return () => controller.abort();
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

        if (message.type === "idea") {
          setIdeas((current) => [...current, message.idea].slice(-500));
          return;
        }

        if (message.type === "hit") {
          const until = Date.now() + battleDurationMs;
          const { attacker, target } = message;
          setCombat((current) => ({
            ...current,
            [attacker.id]: { ...current[attacker.id], until },
            [target.id]: {
              until,
              lastHit: {
                damage: message.damage,
                ko: message.ko,
                key: Date.now(),
              },
            },
          }));

          if (attacker.id === selfId) {
            setSelf((current) => ({ ...current, hp: attacker.hp }));
          }
          if (target.id === selfId) {
            setSelf((current) => ({
              ...current,
              hp: target.hp,
              ghost: target.ghost,
              typing: target.typing,
            }));
            if (target.ghost) {
              setDraft("");
            }
          }
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
        } else if (draftRef.current) {
          updateDraft("");
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

  const attack = useCallback((targetId: string, x: number, y: number) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    // Make sure the server judges range from where the click happened.
    if (cursorSendTimerRef.current) {
      clearTimeout(cursorSendTimerRef.current);
      cursorSendTimerRef.current = null;
    }
    pendingCursorRef.current = null;
    lastSentAtRef.current = Date.now();
    socket.send(JSON.stringify({ type: "cursor", x, y }));
    socket.send(JSON.stringify({ type: "attack", target: targetId }));

    setIsPunching(true);
    if (punchTimerRef.current) {
      clearTimeout(punchTimerRef.current);
    }
    punchTimerRef.current = setTimeout(() => setIsPunching(false), 180);
  }, []);

  const submitIdea = useCallback(async (text: string) => {
    try {
      const response = await fetch(createApiUrl("/api/ideas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author: selfRef.current.name }),
      });
      if (response.ok) {
        return null;
      }

      const data = (await response.json().catch(() => null)) as {
        detail?: unknown;
      } | null;
      return typeof data?.detail === "string"
        ? data.detail
        : "Couldn't save that idea. Try again?";
    } catch {
      return "Couldn't reach the park. Try again?";
    }
  }, []);

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
      combat={combat}
      connectionState={connectionState}
      draft={draft}
      ideas={ideas}
      isFightActive={isFightActive}
      isIdeaBoxOpen={isIdeaBoxOpen}
      isMusicMuted={isMusicMuted}
      isPunching={isPunching}
      isSeated={isSeated}
      notice={notice}
      otherUsers={otherUsers}
      seatedCount={seatedCount}
      self={self}
      onAttack={attack}
      onPointerMove={sendCursor}
      onSit={sitOnBench}
      onStand={standUp}
      onSubmitIdea={submitIdea}
      onToggleIdeaBox={() => setIsIdeaBoxOpen((open) => !open)}
      onToggleMusic={toggleMusic}
      onUpdateName={updateName}
      onUpdateColor={updateColor}
    />
  );
}

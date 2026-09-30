<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Park Bench

Realtime park with multiplayer cursors and a shared conversation bench.

## Stack

- Next.js App Router frontend at `/`
- FastAPI WebSocket backend at `/server` (Vercel Services)
- Optional Redis via `REDIS_URL` for multi-instance presence

## Important files

- `frontend/app/collab-canvas.tsx` — websocket client + sit/typing state
- `frontend/app/components/*` — park scene, bench, cursors
- `backend/app/api/routes/collaboration.py` — presence protocol
- `vercel.json` — Services + rewrites

## Protocol extras

Beyond cursor presence: `typing`, `sit`, `stand`, and `sit_denied`.

- Seating: the server only assigns a `seat` index; the frontend places seated
  users on the bench artwork (`getUserPoint` in `frontend/app/lib/presence.ts`).
- Battles: client sends `attack` with a `target` id; the server checks range,
  cooldown and safe states (seated/ghost), then broadcasts `hit`. At 0 HP the
  target becomes a `ghost` and respawns after a few seconds via `presence`.
  Battle music is an original Web Audio loop (`frontend/app/lib/battle-music.ts`).
- Ideas: `POST /server/api/ideas`, `GET /server/api/ideas.md`, broadcast as
  `idea`. `.github/workflows/ideas-to-pr.yml` turns them into PRs.

## Local run

```bash
pnpm install
cd backend && uv sync && cd ..
# split servers:
cd backend && uv run uvicorn app.main:app --reload --port 5001
NEXT_PUBLIC_WS_URL=http://localhost:5001 pnpm --dir frontend dev
```

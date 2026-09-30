# Park Bench

A realtime park on Vercel where every visitor sees everyone else's cursor. In the middle of the page is a shared bench — sit down and type to talk. Whatever people are typing appears above their cursors.

Built on the [Next.js + FastAPI multiplayer cursors](https://github.com/vercel-labs/nextjs-fastapi-multiplayer-cursors) pattern with Vercel Services.

## What you get

- Live multiplayer cursors across the lawn
- A central park bench with seat assignment (up to 5 people)
- Live typing bubbles above each visitor
- Optional Redis for multi-instance presence

## Stack

- Next.js App Router frontend at `/`
- FastAPI WebSocket backend at `/server`
- Optional Redis (`REDIS_URL`) for shared presence across function instances

## Local setup

```bash
pnpm install
cd backend && uv sync && cd ..
```

### Run with Vercel Services (recommended)

```bash
npx vercel dev -L
```

Open `http://localhost:3000` in a few tabs.

### Split servers

```bash
cd backend && uv run uvicorn app.main:app --reload --port 5001
NEXT_PUBLIC_WS_URL=http://localhost:5001 pnpm --dir frontend dev
```

Redis is optional locally. Without `REDIS_URL`, presence stays in memory for a single backend process.

## How to use

1. Move your mouse — others see your cursor.
2. Click the bench, press Enter, or start typing to sit.
3. Type freely — your draft floats above your seat/cursor.
4. Press Esc to stand up.

## Protocol

| Message | Direction | Purpose |
| --- | --- | --- |
| `hello` | client → server | name/color update |
| `cursor` | client → server | normalized x/y while standing |
| `typing` | client → server | live draft text (max 120 chars) |
| `sit` / `stand` | client → server | claim or leave a bench seat |
| `snapshot` / `presence` / `cursor` / `typing` / `leave` | server → clients | roster + realtime updates |

## Deploy

Deploy as one Vercel Services project (`vercel.json` already maps web + api). For production multi-instance reliability, attach Redis and set `REDIS_URL` (do not expose it as `NEXT_PUBLIC_`).

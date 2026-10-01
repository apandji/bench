# Park Bench

A realtime park on Vercel where every visitor sees everyone else's cursor. In
the middle is a shared bench: sit down and type to talk, and your words float
above your seat. Wander the lawn and you can pick a Pokémon-style fight with
other cursors. Anyone can drop a feature idea in the idea box, and a weekly
job has Claude build one of them as a pull request.

Built on the [Next.js + FastAPI multiplayer cursors](https://github.com/vercel-labs/nextjs-fastapi-multiplayer-cursors) pattern with Vercel Services.

## Features

- **Live cursors.** Every visitor's cursor glides smoothly for everyone else.
- **The bench.** Up to 5 people can sit at once. Seated visitors show as
  figures on the bench, with speech bubbles for what they're typing.
- **Cursor battles.**
  - Click near another wandering cursor to hit them. Each hit does 8–16
    damage, and HP cards appear over the fighters.
  - At 0 HP you become a ghost for a few seconds, then respawn. The bench is
    a safe zone.
  - An original 8-bit battle loop plays during fights (mute toggle in the
    header).
- **Idea box.** Visitors suggest features. Ideas are served as markdown and
  fed to Claude, which builds one per run as a reviewable PR (see
  [Ideas pipeline](#ideas-pipeline)).
- **Optional Redis.** Keeps presence and ideas shared across backend
  instances and restarts.

## Stack

- Next.js 16 App Router frontend at `/` (`frontend/`)
- FastAPI WebSocket + HTTP backend at `/server` (`backend/`)
- Optional Redis (`REDIS_URL`)

## Local setup

```bash
pnpm install
cd backend && uv sync && cd ..
```

### Run with Vercel Services (recommended)

```bash
npx vercel dev -L
```

Open `http://localhost:3000` in a few tabs; each tab is a separate visitor.

### Split servers

```bash
cd backend && uv run uvicorn app.main:app --reload --port 5001
NEXT_PUBLIC_WS_URL=http://localhost:5001 pnpm --dir frontend dev
```

Redis is optional locally. Without `REDIS_URL`, presence and ideas stay in
memory for a single backend process.

### Checks

```bash
pnpm lint
pnpm --dir frontend exec tsc --noEmit
```

## How to play

1. **Move your mouse.** Others see your cursor.
2. **Start typing, press Enter, or click the bench** to sit down. Type to
   talk; Enter clears your bubble.
3. **Press Esc or click "Stand up"** to get up.
4. **While standing, click near someone to attack.** Your HP card appears in
   the bottom-right; theirs floats over their cursor.
5. **Open "Idea box"** in the top-right to suggest what the park should get
   next.

## Protocol

| Message | Direction | Purpose |
| --- | --- | --- |
| `hello` | client → server | name/color update |
| `cursor` | client → server | normalized x/y while standing |
| `typing` | client → server | live draft text (max 120 chars) |
| `sit` / `stand` | client → server | claim or leave a bench seat |
| `attack` | client → server | hit a nearby standing player |
| `snapshot` / `presence` / `cursor` / `typing` / `leave` | server → clients | roster + realtime updates |
| `sit_denied` | server → client | bench is full |
| `hit` | server → clients | damage dealt, HP, knockout |
| `idea` | server → clients | a new idea was submitted |

HTTP: `GET /server/api/presence`, `POST /server/api/ideas`,
`GET /server/api/ideas`, `GET /server/api/ideas.md`.

The full details for contributors and coding agents are in
[AGENTS.md](AGENTS.md).

## Ideas pipeline

1. **Submission.** Visitors submit ideas in the park, rate-limited to 5 per
   minute per IP.
2. **Weekly build.** Every Monday, or when started from the Actions tab,
   `.github/workflows/ideas-to-pr.yml` does three things:
   - downloads `/server/api/ideas.md` into `ideas/IDEAS.md`;
   - asks Claude to build one idea not yet listed in `ideas/IMPLEMENTED.md`;
   - opens a pull request.
3. **Review.** Nothing merges automatically. Ideas come from anonymous
   visitors, so review every PR.

Setup:

- Repository secret `ANTHROPIC_API_KEY`
- Repository variable `PARK_BENCH_URL` (your deployed site)
- `REDIS_URL` on the Vercel deployment, so ideas survive backend restarts

## Roadmap

Planned work lives in [ROADMAP.md](ROADMAP.md). Visitor suggestions live
separately in `ideas/`.

## Deploy

Deploy as one Vercel Services project; `vercel.json` already maps web + api.

For production, attach Redis and set `REDIS_URL`. Never expose it as
`NEXT_PUBLIC_`.

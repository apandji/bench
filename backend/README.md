# FastAPI Realtime Collaboration Backend

This FastAPI service powers the WebSocket and presence APIs used by the Next.js collaboration board. It started from Vercel's FastAPI starter and now includes a realtime presence layer with optional Redis persistence.

## Project Structure

```text
app/
├── main.py                    FastAPI application entrypoint
├── templates/
│   └── index.html             Backend landing page
├── api/
│   ├── main.py                API router assembly
│   ├── deps.py                Shared dependencies
│   └── routes/
│       ├── collaboration.py   WebSocket, presence store, Redis pub/sub, combat
│       ├── ideas.py           Idea box endpoints and markdown feed
│       └── items.py           Sample REST endpoints under /api/v1
└── core/
    └── config.py              Application settings
```

## Install Dependencies

Use `uv` from the `backend` directory:

```bash
uv sync
```

## Run Locally

Start the backend on port `5001`:

```bash
uv run uvicorn app.main:app --reload --port 5001
```

Enable Redis-backed presence by setting `REDIS_URL`:

```bash
REDIS_URL=redis://localhost:6379/0 uv run uvicorn app.main:app --reload --port 5001
```

If `REDIS_URL` is not set, the backend uses the in-memory store. The in-memory store is useful for local development, but it only tracks clients connected to the same backend process.

## Presence Behavior

`app/api/routes/collaboration.py` defines two presence stores:

| Store | When used | Behavior |
| --- | --- | --- |
| `InMemoryPresenceStore` | No `REDIS_URL` | Keeps participants in the current Python process |
| `RedisPresenceStore` | `REDIS_URL` is set | Stores participants in Redis and publishes events across instances |

Participants are pruned after `120` seconds of inactivity. Cursor movement is broadcast immediately to connected clients, and Redis cursor snapshots are persisted on a short interval to reduce write volume.

## WebSocket Endpoint

Connect to:

```text
ws://localhost:5001/ws?id=<id>&name=<name>&color=<hex-color>
```

The server accepts these client messages:

| Message | Description |
| --- | --- |
| `hello` | Updates the participant name and color |
| `cursor` | Updates normalized `x` and `y` cursor coordinates (ignored while seated) |
| `typing` | Updates the live draft text |
| `sit` / `stand` | Claims or leaves a bench seat |
| `attack` | Hits a nearby standing player (`target` id) |

The server sends these messages:

| Message | Description |
| --- | --- |
| `snapshot` | Initial participant list and the active state store |
| `presence` | Participant joined or changed state (profile, seat, ghost/respawn) |
| `cursor` / `typing` | Participant cursor moved or draft changed |
| `sit_denied` | The bench is full |
| `hit` | Damage dealt, updated HP, knockout flag |
| `idea` | A visitor submitted an idea |
| `leave` | Participant disconnected |

Combat rules (range, cooldown, damage, ghost/respawn) are enforced here, not
in the browser. See the root `AGENTS.md` for the full protocol.

Input is intentionally small and defensive: text fields are trimmed and capped, colors must be `#RRGGBB`, and coordinates are clamped from `0` to `1`.

## API Endpoints

When the backend runs by itself:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Backend landing page |
| `WS` | `/ws` | Collaboration WebSocket endpoint |
| `GET` | `/api/presence` | Current presence snapshot and active state store |
| `POST` | `/api/ideas` | Submit an idea (`{text, author}`, 5/min per IP) |
| `GET` | `/api/ideas` | All ideas as JSON |
| `GET` | `/api/ideas.md` | All ideas as markdown |
| `GET` | `/api/v1/items/` | List sample items |
| `GET` | `/api/v1/items/{item_id}` | Get item by ID |
| `GET` | `/docs` | Interactive API docs |

In the root Vercel Services project, the backend is mounted at `/server`, so these routes are available as `/server/ws`, `/server/api/presence`, `/server/api/v1/items/`, and `/server/docs`. The Next.js app in `frontend/` uses that same-origin `/server` route.

## Deploying

Deploy this service from the repository root as part of the Vercel Services project. The root `vercel.json` maps `backend/` to the `api` service and exposes it publicly with a `/server/(.*)` rewrite. The FastAPI app strips that prefix before route matching.

Set `REDIS_URL` in Vercel Environment Variables for shared presence across backend instances.

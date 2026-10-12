# End-to-end smoke tests

Playwright drives the real app with several visitors at once. Each visitor is
its own browser context, because identity lives in `sessionStorage`.

## Run

```bash
pnpm install
cd backend && uv sync && cd ..
pnpm test:e2e            # or: pnpm --dir frontend test:e2e
```

`playwright.config.ts` starts both servers for you:

- backend: `uv run uvicorn app.main:app` in `../backend` on `E2E_API_PORT` (default 5001)
- frontend: `pnpm dev` on `E2E_WEB_PORT` (default 3000), with
  `NEXT_PUBLIC_WS_URL=http://localhost:<api>`

If those ports are busy, pick others:

```bash
E2E_API_PORT=5101 E2E_WEB_PORT=3100 pnpm test:e2e
```

The backend is started with `CORS_ORIGINS` set to the chosen web origin, so the
idea box works on any port. Locally, servers already running on those ports are
reused; on CI (`CI` set) they are always started fresh.

Browsers: cloud sessions have Chromium preinstalled (`PLAYWRIGHT_BROWSERS_PATH`
is preset; don't run `playwright install`). On a fresh machine or CI, run
`pnpm --dir frontend exec playwright install --with-deps chromium` once.

## What's covered (`park.spec.ts`)

Two visitors, A and B, in every test:

1. A moves; B sees A's cursor appear and glide.
2. A types on the page (sits automatically); B sees the speech text and
   "1 seated"; A presses Escape; B sees A standing.
3. A clicks B's cursor; B's HP readout drops below 100.
4. A submits an idea; B sees it in the idea box.
5. B reloads; both still see each other.

Tests run serially (`workers: 1`) because all visitors share one park.
Debug a failure with `pnpm --dir frontend exec playwright test --ui` or
`--headed`; CI keeps a trace on the first retry (`playwright-report/`).

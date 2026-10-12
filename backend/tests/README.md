# Backend protocol tests

These tests start a real uvicorn server (in-memory store, `REDIS_URL` unset) on a free port and drive it with real `websockets` clients and `httpx`. They don't use Starlette's `TestClient`.

```bash
cd backend
uv sync
uv run pytest -q              # full suite, about 30s
uv run pytest -q -m "not slow"  # skip the timer-bound KO and HP-reset tests
```

- `conftest.py` holds the session-scoped `server` fixture and the `visitors` factory. Each visitor has `send`, `wait_for(predicate, timeout)`, `expect_none(predicate, within)`, `sync()` and `move(x, y, observer)`.
- Game values come from the constants in `app.api.routes.collaboration` and `app.api.routes.ideas`. Never hard-code them.
- Every test shares one server. Visitors use uuid ids, and teardown waits until the server has dropped them, so bench seats free up. Idea tests send a unique `X-Forwarded-For` so they don't share the rate-limit budget.
- Tests marked `xfail(strict=True)` document known bugs. Once a bug is fixed, remove the marker.

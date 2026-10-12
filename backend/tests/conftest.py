"""Shared harness: a real uvicorn server plus real `websockets` clients.

Starlette's TestClient is deliberately not used: it runs each websocket on its
own event loop, so cross-client broadcasts and background tasks hang there.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any, AsyncIterator, Callable
from urllib.parse import urlencode

import httpx
import pytest
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

Predicate = Callable[[dict[str, Any]], bool]


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers", "slow: waits on real game timers (still runs by default)"
    )


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Server:
    def __init__(self, port: int) -> None:
        self.port = port
        self.http = f"http://127.0.0.1:{port}"
        self.ws = f"ws://127.0.0.1:{port}"


@pytest.fixture(scope="session")
def server(tmp_path_factory: pytest.TempPathFactory) -> Server:
    port = _free_port()
    log_path = tmp_path_factory.mktemp("uvicorn") / "server.log"
    env = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
    with open(log_path, "wb") as log:
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    srv = Server(port)
    try:
        deadline = time.monotonic() + 20
        while True:
            if proc.poll() is not None:
                pytest.fail(
                    f"uvicorn exited with {proc.returncode}:\n{log_path.read_text()}"
                )
            try:
                if httpx.get(f"{srv.http}/api/presence", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.monotonic() > deadline:
                pytest.fail(f"uvicorn did not start:\n{log_path.read_text()}")
            time.sleep(0.1)
        yield srv
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def _brief(msg: dict[str, Any]) -> str:
    text = json.dumps(msg)
    return text if len(text) < 200 else text[:197] + "..."


class Visitor:
    """One websocket visitor. Messages are consumed in order by wait_for."""

    def __init__(self, ws: ClientConnection, visitor_id: str, snapshot: dict[str, Any]):
        self.ws = ws
        self.id = visitor_id
        self.snapshot = snapshot
        self.recent: deque[dict[str, Any]] = deque(maxlen=15)

    async def send(self, obj: dict[str, Any]) -> None:
        await self.ws.send(json.dumps(obj))

    async def send_raw(self, text: str) -> None:
        await self.ws.send(text)

    async def _next(self, timeout: float) -> dict[str, Any]:
        raw = await asyncio.wait_for(self.ws.recv(), timeout)
        msg = json.loads(raw)
        self.recent.append(msg)
        return msg

    async def wait_for(
        self, predicate: Predicate, timeout: float = 3.0, what: str = "message"
    ) -> dict[str, Any]:
        """Skip unrelated messages until one matches; fail clearly on timeout."""
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            try:
                if remaining <= 0:
                    raise TimeoutError
                msg = await self._next(remaining)
            except TimeoutError:
                seen = "\n  ".join(_brief(m) for m in self.recent) or "(nothing)"
                pytest.fail(
                    f"visitor {self.id[:8]} timed out after {timeout}s waiting for "
                    f"{what}. Recent messages:\n  {seen}"
                )
            except ConnectionClosed as exc:
                pytest.fail(f"visitor {self.id[:8]} connection closed waiting for {what}: {exc}")
            if predicate(msg):
                return msg

    async def expect_none(
        self, predicate: Predicate, within: float = 0.5, what: str = "message"
    ) -> None:
        """Assert no matching message arrives in the window."""
        deadline = time.monotonic() + within
        while (remaining := deadline - time.monotonic()) > 0:
            try:
                msg = await self._next(remaining)
            except TimeoutError:
                return
            except ConnectionClosed as exc:
                pytest.fail(f"visitor {self.id[:8]} connection closed: {exc}")
            if predicate(msg):
                pytest.fail(f"visitor {self.id[:8]} got unexpected {what}: {_brief(msg)}")

    async def sync(self) -> dict[str, Any]:
        """Round-trip a `hello` so every earlier frame has been processed."""
        await self.send({"type": "hello"})
        return await self.wait_for(
            lambda m: m.get("type") == "presence" and m["user"]["id"] == self.id,
            what="own hello echo",
        )

    async def move(self, x: float, y: float, observer: "Visitor") -> None:
        """Move the cursor and wait until `observer` sees the new position."""
        await self.send({"type": "cursor", "x": x, "y": y})
        await observer.wait_for(
            lambda m: m.get("type") == "cursor"
            and m["user"]["id"] == self.id
            and m["user"]["x"] == x
            and m["user"]["y"] == y,
            what=f"cursor of {self.id[:8]} at ({x}, {y})",
        )


async def _wait_gone(server: Server, ids: set[str], timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    async with httpx.AsyncClient(base_url=server.http) as client:
        while time.monotonic() < deadline:
            users = (await client.get("/api/presence")).json()["users"]
            if not ids & {u["id"] for u in users}:
                return
            await asyncio.sleep(0.05)
    raise AssertionError(f"server never removed visitors {ids}")


@pytest.fixture
async def visitors(server: Server) -> AsyncIterator[Callable[..., Any]]:
    """Factory: `await visitors(name=..., color=..., prefix=...)` -> Visitor.

    Every visitor gets a uuid id. At teardown all sockets close and we wait for
    the server to drop them, so seats are free for the next test.
    """
    opened: list[Visitor] = []

    async def make(
        name: str = "Tester", color: str = "#123456", prefix: str = "", **extra: str
    ) -> Visitor:
        visitor_id = uuid.uuid4().hex
        query = urlencode({"id": visitor_id, "name": name, "color": color, **extra})
        ws = await connect(f"{server.ws}{prefix}/ws?{query}")
        raw = await asyncio.wait_for(ws.recv(), 3)
        snapshot = json.loads(raw)
        assert snapshot["type"] == "snapshot", snapshot
        visitor = Visitor(ws, visitor_id, snapshot)
        opened.append(visitor)
        return visitor

    yield make

    for visitor in opened:
        await visitor.ws.close()
    if opened:
        await _wait_gone(server, {v.id for v in opened})


@pytest.fixture
async def http(server: Server) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(base_url=server.http) as client:
        yield client

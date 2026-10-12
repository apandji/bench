"""Idea box HTTP endpoints.

The rate limit keys on the first X-Forwarded-For entry, so each test sends its
own fake client IP and never eats another test's budget.
"""

from __future__ import annotations

import uuid

from app.api.routes import ideas as ideas_mod


def fake_ip() -> dict[str, str]:
    n = uuid.uuid4().int
    return {"x-forwarded-for": f"10.{n % 250}.{(n >> 8) % 250}.{(n >> 16) % 250 + 1}"}


async def test_post_validation(http):
    headers = fake_ip()
    too_short = "x" * (ideas_mod.MIN_IDEA_LENGTH - 1)
    too_long = "x" * (ideas_mod.MAX_IDEA_LENGTH + 1)
    for body in [
        {"text": too_short},
        {"text": "   " + too_short + "   "},
        {"text": too_long},
        {"text": 42},
        {"author": "nobody"},
    ]:
        response = await http.post("/api/ideas", json=body, headers=headers)
        assert 400 <= response.status_code < 500, (body, response.text)

    # Boundaries are accepted (2 of the 5 per-minute budget for this IP).
    for text in ["x" * ideas_mod.MIN_IDEA_LENGTH, "y" * ideas_mod.MAX_IDEA_LENGTH]:
        response = await http.post("/api/ideas", json={"text": text}, headers=headers)
        assert response.status_code == 201, response.text


async def test_idea_listed_rendered_and_broadcast(http, visitors):
    watcher = await visitors()
    marker = uuid.uuid4().hex[:12]
    text = f"Add a   fountain {marker} *now*"
    response = await http.post(
        "/api/ideas", json={"text": text, "author": "  Ada  "}, headers=fake_ip()
    )
    assert response.status_code == 201
    idea = response.json()
    assert idea["text"] == f"Add a fountain {marker} *now*"
    assert idea["author"] == "Ada"

    broadcast = await watcher.wait_for(
        lambda m: m.get("type") == "idea" and marker in m["idea"]["text"],
        what="idea broadcast",
    )
    assert broadcast["idea"] == idea

    listed = (await http.get("/api/ideas")).json()
    assert idea in listed["ideas"]
    assert listed["total"] == len(listed["ideas"])

    md = await http.get("/api/ideas.md")
    assert md.status_code == 200
    assert md.headers["content-type"].startswith("text/markdown")
    line = next(line for line in md.text.splitlines() if marker in line)
    assert "Ada" in line
    assert r"\*now\*" in line  # markdown is escaped


async def test_rate_limit(http):
    headers = fake_ip()
    for i in range(ideas_mod.SUBMISSIONS_PER_WINDOW):
        response = await http.post(
            "/api/ideas", json={"text": f"rate limit probe {i}"}, headers=headers
        )
        assert response.status_code == 201, response.text

    response = await http.post(
        "/api/ideas", json={"text": "one too many"}, headers=headers
    )
    assert response.status_code == 429

    # Another client is unaffected.
    response = await http.post(
        "/api/ideas", json={"text": "different visitor"}, headers=fake_ip()
    )
    assert response.status_code == 201

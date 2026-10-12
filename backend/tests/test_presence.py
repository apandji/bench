"""Connect/leave, cursor, typing and input hardening."""

from __future__ import annotations

import pytest

from app.api.routes import collaboration as collab


def is_type(kind: str, user_id: str):
    return lambda m: m.get("type") == kind and m.get("user", {}).get("id") == user_id


async def test_connect_snapshot_presence_and_leave(visitors):
    a = await visitors(name="Alice")
    assert a.snapshot["selfId"] == a.id
    assert a.snapshot["stateStore"] == "memory"
    me = next(u for u in a.snapshot["users"] if u["id"] == a.id)
    assert me["name"] == "Alice"
    assert me["hp"] == collab.MAX_HP
    for private in collab.PRIVATE_FIELDS:
        assert private not in me

    b = await visitors(name="Bob")
    assert a.id in {u["id"] for u in b.snapshot["users"]}
    joined = await a.wait_for(is_type("presence", b.id), what="presence for Bob")
    assert joined["user"]["name"] == "Bob"

    await a.send({"type": "hello", "name": "Alicia", "color": "#abcdef"})
    renamed = await b.wait_for(is_type("presence", a.id), what="Alice's hello")
    assert renamed["user"]["name"] == "Alicia"
    assert renamed["user"]["color"] == "#abcdef"

    await b.ws.close()
    await a.wait_for(
        lambda m: m.get("type") == "leave" and m.get("id") == b.id, what="leave for Bob"
    )


async def test_server_prefix_routes(visitors, http):
    a = await visitors(prefix="/server")
    assert a.snapshot["selfId"] == a.id
    response = await http.get("/server/api/presence")
    assert response.status_code == 200
    assert a.id in {u["id"] for u in response.json()["users"]}


async def test_cursor_is_clamped(visitors):
    a = await visitors()
    b = await visitors()
    await a.send({"type": "cursor", "x": 5, "y": -3})
    msg = await b.wait_for(is_type("cursor", a.id), what="clamped cursor")
    assert (msg["user"]["x"], msg["user"]["y"]) == (1, 0)

    await a.send({"type": "cursor", "x": "junk", "y": 0.25})
    msg = await b.wait_for(is_type("cursor", a.id), what="cursor with junk x")
    assert (msg["user"]["x"], msg["user"]["y"]) == (1, 0.25)


@pytest.mark.xfail(
    strict=True,
    reason="clamp_float lets NaN through; the server then emits invalid JSON (NaN)",
)
async def test_cursor_nan_is_rejected(visitors):
    a = await visitors()
    b = await visitors()
    await a.send_raw('{"type": "cursor", "x": NaN, "y": 0.5}')
    msg = await b.wait_for(is_type("cursor", a.id), what="cursor after NaN")
    assert 0 <= msg["user"]["x"] <= 1


async def test_cursor_ignored_while_seated(visitors):
    a = await visitors()
    b = await visitors()
    await a.send({"type": "sit"})
    await b.wait_for(
        lambda m: is_type("presence", a.id)(m) and m["user"]["seated"], what="a seated"
    )
    await a.send({"type": "cursor", "x": 0.2, "y": 0.2})
    await a.sync()
    await b.expect_none(is_type("cursor", a.id), within=0.3, what="cursor while seated")

    await a.send({"type": "stand"})
    await a.move(0.2, 0.2, observer=b)


async def test_typing_capped(visitors):
    a = await visitors()
    b = await visitors()
    await a.send({"type": "typing", "text": "x" * 500})
    msg = await b.wait_for(is_type("typing", a.id), what="typing")
    assert msg["user"]["typing"] == "x" * 120

    await a.send({"type": "typing", "text": "hi"})
    msg = await b.wait_for(is_type("typing", a.id), what="short typing")
    assert msg["user"]["typing"] == "hi"


async def test_malformed_frames_do_not_kill_connection(visitors):
    a = await visitors()
    b = await visitors()
    for frame in ["not json", "[1, 2, 3]", '"string"', "{", '{"type": "bogus"}', '{"x": 1}']:
        await a.send_raw(frame)
    await a.send({"type": "cursor", "x": 0.3, "y": 0.4})
    msg = await b.wait_for(is_type("cursor", a.id), what="cursor after junk frames")
    assert (msg["user"]["x"], msg["user"]["y"]) == (0.3, 0.4)
    await a.sync()


async def test_bad_color_falls_back(visitors):
    a = await visitors(color="red")
    me = next(u for u in a.snapshot["users"] if u["id"] == a.id)
    color = me["color"]
    assert color != "red"
    assert len(color) == 7 and color.startswith("#")
    int(color[1:], 16)

    await a.send({"type": "hello", "color": "javascript:alert(1)"})
    echo = await a.wait_for(is_type("presence", a.id), what="hello echo")
    assert echo["user"]["color"] == color

    await a.send({"type": "hello", "color": "#00FF7f"})
    echo = await a.wait_for(is_type("presence", a.id), what="hello echo")
    assert echo["user"]["color"] == "#00FF7f"


async def test_long_name_is_truncated(visitors):
    a = await visitors(name="n" * 200)
    me = next(u for u in a.snapshot["users"] if u["id"] == a.id)
    assert me["name"] == "n" * 40

"""Sit / stand and seat allocation. The bench is shared, so read free seats live."""

from __future__ import annotations

from app.api.routes import collaboration as collab


async def taken_seats(http) -> set[int]:
    users = (await http.get("/api/presence")).json()["users"]
    return {u["seat"] for u in users if u["seated"]}


async def sit(visitor, seat=None) -> dict:
    message = {"type": "sit"} if seat is None else {"type": "sit", "seat": seat}
    await visitor.send(message)
    reply = await visitor.wait_for(
        lambda m: m.get("type") == "sit_denied"
        or (
            m.get("type") == "presence"
            and m["user"]["id"] == visitor.id
            and m["user"]["seated"]
        ),
        what="sit result",
    )
    return reply


async def test_sit_assigns_seat_and_stand_frees_it(visitors, http):
    a = await visitors()
    reply = await sit(a)
    seat = reply["user"]["seat"]
    assert 0 <= seat < collab.MAX_SEATS
    assert seat in await taken_seats(http)

    await a.send({"type": "stand"})
    stood = await a.wait_for(
        lambda m: m.get("type") == "presence" and m["user"]["id"] == a.id,
        what="stand echo",
    )
    assert stood["user"]["seated"] is False
    assert stood["user"]["seat"] is None
    assert seat not in await taken_seats(http)

    b = await visitors()
    assert (await sit(b, seat))["user"]["seat"] == seat


async def test_preferred_seat_honored_and_never_shared(visitors, http):
    free = sorted(set(range(collab.MAX_SEATS)) - await taken_seats(http))
    assert len(free) >= 2, "test needs two free seats"
    preferred = free[-1]

    a = await visitors()
    b = await visitors()
    assert (await sit(a, preferred))["user"]["seat"] == preferred
    other = (await sit(b, preferred))["user"]["seat"]
    assert other != preferred
    assert 0 <= other < collab.MAX_SEATS

    # Out-of-range or junk preferences still get a valid seat.
    c = await visitors()
    junk = (await sit(c, 99))["user"]["seat"]
    assert junk not in {preferred, other}
    assert 0 <= junk < collab.MAX_SEATS


async def test_bench_full_denies_sit(visitors, http):
    free = set(range(collab.MAX_SEATS)) - await taken_seats(http)
    sitters = [await visitors() for _ in free]
    seats = {(await sit(v))["user"]["seat"] for v in sitters}
    assert seats == free
    assert await taken_seats(http) == set(range(collab.MAX_SEATS))

    extra = await visitors()
    reply = await sit(extra)
    assert reply["type"] == "sit_denied"
    assert reply["reason"]

    await sitters[0].send({"type": "stand"})
    await sitters[0].sync()
    assert (await sit(extra))["type"] == "presence"

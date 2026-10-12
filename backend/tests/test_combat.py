"""Attack, cooldown, safe zone, KO/ghost/respawn and the quiet-fight HP reset."""

from __future__ import annotations

import asyncio
import math
import time

import pytest

from app.api.routes import collaboration as collab

LO, HI = collab.HIT_DAMAGE_RANGE
COOLDOWN = collab.HIT_COOLDOWN_SECONDS + 0.05


def hit_on(target_id: str, attacker_id: str | None = None):
    def match(m):
        return (
            m.get("type") == "hit"
            and m["target"]["id"] == target_id
            and (attacker_id is None or m["attacker"]["id"] == attacker_id)
        )

    return match


def any_hit_by(attacker_id: str):
    return lambda m: m.get("type") == "hit" and m["attacker"]["id"] == attacker_id


async def duel(visitors, x=0.5, y=0.5):
    """Two standing visitors on the same spot; both positions confirmed server-side."""
    a = await visitors()
    b = await visitors()
    await b.move(x, y, observer=a)
    await a.move(x, y, observer=b)
    return a, b


async def attack(attacker, target, observer=None) -> dict:
    await attacker.send({"type": "attack", "target": target.id})
    return await (observer or attacker).wait_for(
        hit_on(target.id, attacker.id), what="hit"
    )


async def test_out_of_range_does_nothing(visitors):
    a = await visitors()
    b = await visitors()
    await b.move(0.2, 0.2, observer=a)
    far = round(0.2 + collab.HIT_RANGE * 1.5, 4)
    await a.move(far, 0.2, observer=b)

    await a.send({"type": "attack", "target": b.id})
    await b.expect_none(any_hit_by(a.id), within=0.5, what="out-of-range hit")

    # Control: just inside range, after the cooldown the attempt consumed.
    near = round(0.2 + collab.HIT_RANGE * 0.9, 4)
    await a.move(near, 0.2, observer=b)
    await asyncio.sleep(COOLDOWN)
    hit = await attack(a, b, observer=b)
    assert hit["ko"] is False


async def test_hit_damage_and_cooldown(visitors):
    a, b = await duel(visitors)
    await a.send({"type": "attack", "target": b.id})
    await a.send({"type": "attack", "target": b.id})
    hit = await b.wait_for(hit_on(b.id, a.id), what="first hit")
    assert LO <= hit["damage"] <= HI
    assert hit["target"]["hp"] == collab.MAX_HP - hit["damage"]
    assert hit["ko"] is False
    for field in collab.PRIVATE_FIELDS:
        assert field not in hit["target"] and field not in hit["attacker"]
    await b.expect_none(any_hit_by(a.id), within=0.4, what="hit inside cooldown")

    await asyncio.sleep(COOLDOWN)
    second = await attack(a, b, observer=b)
    assert second["target"]["hp"] == hit["target"]["hp"] - second["damage"]


async def test_cannot_attack_self(visitors):
    a, b = await duel(visitors)
    await a.send({"type": "attack", "target": a.id})
    await a.expect_none(any_hit_by(a.id), within=0.4, what="self hit")
    hit = await attack(a, b)  # control: no cooldown was consumed
    assert hit["target"]["id"] == b.id


async def test_bad_target_values_ignored(visitors):
    a, b = await duel(visitors)
    for target in [None, 123, ["x"], {"id": b.id}, "nobody-here"]:
        await a.send({"type": "attack", "target": target})
    await a.expect_none(any_hit_by(a.id), within=0.4, what="hit on junk target")
    await asyncio.sleep(COOLDOWN)  # "nobody-here" is a string, so it used the cooldown
    await attack(a, b)


async def test_bench_is_safe_zone(visitors):
    a, b = await duel(visitors)

    # Seated target can't be hit.
    await b.send({"type": "sit"})
    await a.wait_for(
        lambda m: m.get("type") == "presence" and m["user"]["id"] == b.id and m["user"]["seated"],
        what="b seated",
    )
    await a.send({"type": "attack", "target": b.id})
    await a.expect_none(any_hit_by(a.id), within=0.4, what="hit on seated target")

    await b.send({"type": "stand"})
    await a.wait_for(
        lambda m: m.get("type") == "presence" and m["user"]["id"] == b.id and not m["user"]["seated"],
        what="b standing",
    )

    # Seated attacker can't attack.
    await a.send({"type": "sit"})
    await a.send({"type": "attack", "target": b.id})
    await b.expect_none(any_hit_by(a.id), within=0.4, what="hit from seated attacker")
    await a.send({"type": "stand"})
    await a.sync()

    await asyncio.sleep(COOLDOWN)
    await attack(a, b)  # control


async def test_nan_position_cannot_bypass_range(visitors):
    a = await visitors()
    b = await visitors()
    await b.move(0.9, 0.9, observer=a)
    await a.send_raw('{"type": "cursor", "x": NaN, "y": NaN}')
    await a.sync()
    await a.send({"type": "attack", "target": b.id})
    await b.expect_none(any_hit_by(a.id), within=0.5, what="hit from NaN position")


@pytest.mark.slow
async def test_ko_ghost_and_respawn(visitors):
    a, b = await duel(visitors)
    c = await visitors()  # a third party to attack the ghost and be attacked by it
    await c.move(0.5, 0.5, observer=a)

    hp = collab.MAX_HP
    max_swings = math.ceil(collab.MAX_HP / LO) + 1
    for _ in range(max_swings):
        hit = await attack(a, b, observer=b)
        assert LO <= hit["damage"] <= HI
        hp = max(hp - hit["damage"], 0)
        assert hit["target"]["hp"] == hp
        if hit["ko"]:
            break
        await asyncio.sleep(COOLDOWN)
    else:
        pytest.fail("never knocked out")

    ko_at = time.monotonic()
    assert hp == 0
    assert hit["target"]["ghost"] is True

    # Ghosts can't be attacked...
    await c.send({"type": "attack", "target": b.id})
    await b.expect_none(hit_on(b.id), within=0.4, what="hit on ghost")
    # ...and can't attack.
    await b.send({"type": "attack", "target": c.id})
    await c.expect_none(any_hit_by(b.id), within=0.4, what="hit by ghost")

    respawned = await a.wait_for(
        lambda m: m.get("type") == "presence"
        and m["user"]["id"] == b.id
        and m["user"]["ghost"] is False,
        timeout=collab.GHOST_SECONDS + 3,
        what="respawn presence",
    )
    assert respawned["user"]["hp"] == collab.MAX_HP
    assert time.monotonic() - ko_at >= collab.GHOST_SECONDS - 0.5

    # Back in the game: b can attack again.
    await attack(b, c)


@pytest.mark.slow
async def test_hp_resets_after_quiet_battle(visitors):
    """HP reset is lazy: it shows up as full HP on the next hit after BATTLE_SECONDS."""
    a, b = await duel(visitors)
    first = await attack(a, b)
    assert first["target"]["hp"] == collab.MAX_HP - first["damage"]

    await asyncio.sleep(COOLDOWN)
    second = await attack(a, b)
    assert second["target"]["hp"] == first["target"]["hp"] - second["damage"]

    await asyncio.sleep(collab.BATTLE_SECONDS + 0.5)
    fresh = await attack(a, b)
    assert fresh["target"]["hp"] == collab.MAX_HP - fresh["damage"]

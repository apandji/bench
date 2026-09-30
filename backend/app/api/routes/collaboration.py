from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import random
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Protocol

import certifi
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis


router = APIRouter()
logger = logging.getLogger(__name__)

PRESENCE_HASH_KEY = "parkbench:presence:users"
PRESENCE_ACTIVITY_KEY = "parkbench:presence:activity"
PRESENCE_CHANNEL = "parkbench:presence:events"
IDEAS_KEY = "parkbench:ideas"
MAX_IDEAS = 500
STALE_AFTER_SECONDS = 120
INSTANCE_ID = uuid.uuid4().hex
CURSOR_SNAPSHOT_INTERVAL_SECONDS = 0.75
MAX_SEATS = 5

MAX_HP = 100
HIT_DAMAGE_RANGE = (8, 16)
HIT_RANGE = 0.07
HIT_COOLDOWN_SECONDS = 0.35
BATTLE_SECONDS = 8
GHOST_SECONDS = 5

# Server-only fields that never leave this process.
PRIVATE_FIELDS = ("battle_until", "last_attack_at")


@dataclass
class Participant:
    id: str
    name: str
    color: str
    x: float
    y: float
    updated_at: float
    typing: str = ""
    seated: bool = False
    seat: int | None = None
    hp: int = MAX_HP
    ghost: bool = False
    battle_until: float = 0
    last_attack_at: float = 0


class PresenceStore(Protocol):
    label: str

    async def snapshot(self) -> list[dict[str, Any]]:
        ...

    async def upsert(self, participant: Participant) -> None:
        ...

    async def remove(self, participant_id: str) -> None:
        ...

    async def publish(self, event: dict[str, Any]) -> None:
        ...

    async def start_listener(self, on_event: Any) -> None:
        ...

    async def add_idea(self, idea: dict[str, Any]) -> None:
        ...

    async def list_ideas(self) -> list[dict[str, Any]]:
        ...


class InMemoryPresenceStore:
    label = "memory"

    def __init__(self) -> None:
        self.participants: dict[str, Participant] = {}
        self.ideas: list[dict[str, Any]] = []
        self.lock = asyncio.Lock()

    async def snapshot(self) -> list[dict[str, Any]]:
        async with self.lock:
            self.prune_stale()
            return [serialize_user(user) for user in self.participants.values()]

    async def upsert(self, participant: Participant) -> None:
        async with self.lock:
            self.participants[participant.id] = participant

    async def remove(self, participant_id: str) -> None:
        async with self.lock:
            self.participants.pop(participant_id, None)

    async def publish(self, event: dict[str, Any]) -> None:
        return None

    async def start_listener(self, on_event: Any) -> None:
        return None

    async def add_idea(self, idea: dict[str, Any]) -> None:
        async with self.lock:
            self.ideas.append(idea)
            del self.ideas[:-MAX_IDEAS]

    async def list_ideas(self) -> list[dict[str, Any]]:
        async with self.lock:
            return list(self.ideas)

    def prune_stale(self) -> None:
        cutoff = time.time() - STALE_AFTER_SECONDS
        stale_ids = [
            user_id
            for user_id, user in self.participants.items()
            if user.updated_at < cutoff
        ]
        for user_id in stale_ids:
            self.participants.pop(user_id, None)

    async def taken_seats(self, exclude_id: str | None = None) -> set[int]:
        async with self.lock:
            return {
                user.seat
                for user in self.participants.values()
                if user.seated
                and user.seat is not None
                and user.id != exclude_id
            }


class RedisPresenceStore:
    label = "redis"

    def __init__(self, redis_url: str) -> None:
        kwargs: dict[str, Any] = {"decode_responses": True}
        if redis_url.startswith("rediss://"):
            kwargs["ssl_ca_certs"] = certifi.where()

        self.redis = Redis.from_url(redis_url, **kwargs)
        self.listener_lock = asyncio.Lock()
        self.listener_started = False

    async def connect(self) -> None:
        await self.redis.ping()

    async def snapshot(self) -> list[dict[str, Any]]:
        await self.prune_stale()
        return [json.loads(user) for user in await self.redis.hvals(PRESENCE_HASH_KEY)]

    async def upsert(self, participant: Participant) -> None:
        payload = json.dumps(serialize_user(participant))
        pipe = self.redis.pipeline()
        pipe.hset(PRESENCE_HASH_KEY, participant.id, payload)
        pipe.zadd(PRESENCE_ACTIVITY_KEY, {participant.id: participant.updated_at})
        pipe.expire(PRESENCE_HASH_KEY, STALE_AFTER_SECONDS * 4)
        pipe.expire(PRESENCE_ACTIVITY_KEY, STALE_AFTER_SECONDS * 4)
        await pipe.execute()

    async def remove(self, participant_id: str) -> None:
        pipe = self.redis.pipeline()
        pipe.hdel(PRESENCE_HASH_KEY, participant_id)
        pipe.zrem(PRESENCE_ACTIVITY_KEY, participant_id)
        await pipe.execute()

    async def publish(self, event: dict[str, Any]) -> None:
        await self.redis.publish(
            PRESENCE_CHANNEL, json.dumps({"origin": INSTANCE_ID, "event": event})
        )

    async def start_listener(self, on_event: Any) -> None:
        async with self.listener_lock:
            if self.listener_started:
                return

            self.listener_started = True
            asyncio.create_task(self.listen(on_event))

    async def listen(self, on_event: Any) -> None:
        while True:
            try:
                pubsub = self.redis.pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(PRESENCE_CHANNEL)

                async for message in pubsub.listen():
                    payload = parse_message(message.get("data"))
                    if not payload or payload.get("origin") == INSTANCE_ID:
                        continue

                    event = payload.get("event")
                    if isinstance(event, dict):
                        await on_event(event)
            except Exception:
                logger.exception("Redis pub/sub listener failed; reconnecting")
                await asyncio.sleep(1)

    async def add_idea(self, idea: dict[str, Any]) -> None:
        pipe = self.redis.pipeline()
        pipe.rpush(IDEAS_KEY, json.dumps(idea))
        pipe.ltrim(IDEAS_KEY, -MAX_IDEAS, -1)
        await pipe.execute()

    async def list_ideas(self) -> list[dict[str, Any]]:
        return [json.loads(idea) for idea in await self.redis.lrange(IDEAS_KEY, 0, -1)]

    async def prune_stale(self) -> None:
        cutoff = time.time() - STALE_AFTER_SECONDS
        stale_ids = await self.redis.zrangebyscore(PRESENCE_ACTIVITY_KEY, "-inf", cutoff)
        if not stale_ids:
            return

        pipe = self.redis.pipeline()
        pipe.hdel(PRESENCE_HASH_KEY, *stale_ids)
        pipe.zrem(PRESENCE_ACTIVITY_KEY, *stale_ids)
        await pipe.execute()

    async def taken_seats(self, exclude_id: str | None = None) -> set[int]:
        users = await self.snapshot()
        taken: set[int] = set()
        for user in users:
            if user.get("id") == exclude_id:
                continue
            if user.get("seated") and isinstance(user.get("seat"), int):
                taken.add(user["seat"])
        return taken


clients: dict[str, WebSocket] = {}
# Participants whose socket lives on this instance; combat is resolved here.
local_participants: dict[str, Participant] = {}
clients_lock = asyncio.Lock()
cursor_snapshot_tasks: dict[str, asyncio.Task[None]] = {}
cursor_snapshot_lock = asyncio.Lock()
background_tasks: set[asyncio.Task[Any]] = set()
store: PresenceStore | None = None
store_lock = asyncio.Lock()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    presence_store = await get_store()
    await presence_store.start_listener(handle_remote_event)

    participant = Participant(
        id=clean_text(
            websocket.query_params.get("id"), fallback=f"user-{time.time_ns()}"
        ),
        name=clean_text(websocket.query_params.get("name"), fallback="Visitor"),
        color=clean_color(websocket.query_params.get("color"), fallback="#2563eb"),
        x=0.5,
        y=0.5,
        updated_at=time.time(),
    )

    async with clients_lock:
        clients[participant.id] = websocket
        local_participants[participant.id] = participant

    await presence_store.upsert(participant)

    try:
        await websocket.send_json(
            {
                "type": "snapshot",
                "selfId": participant.id,
                "users": await presence_store.snapshot(),
                "stateStore": presence_store.label,
            }
        )
        await announce(
            {"type": "presence", "user": serialize_user(participant)},
            skip_id=participant.id,
        )

        while True:
            message = parse_message(await websocket.receive_text())
            if not message:
                continue

            message_type = message.get("type")

            if message_type == "hello":
                participant.name = clean_text(
                    message.get("name"), fallback=participant.name
                )
                participant.color = clean_color(
                    message.get("color"), fallback=participant.color
                )
                participant.updated_at = time.time()
                await presence_store.upsert(participant)
                await announce({"type": "presence", "user": serialize_user(participant)})

            elif message_type == "cursor":
                if participant.seated:
                    continue
                participant.x = clamp_float(message.get("x"), fallback=participant.x)
                participant.y = clamp_float(message.get("y"), fallback=participant.y)
                participant.updated_at = time.time()
                await announce_realtime(
                    presence_store,
                    {"type": "cursor", "user": serialize_user(participant)},
                    skip_id=participant.id,
                )
                await schedule_cursor_snapshot(presence_store, participant)

            elif message_type == "typing":
                participant.typing = clean_typing(message.get("text"))
                participant.updated_at = time.time()
                await announce_realtime(
                    presence_store,
                    {"type": "typing", "user": serialize_user(participant)},
                    skip_id=participant.id,
                )
                await schedule_cursor_snapshot(presence_store, participant)

            elif message_type == "sit":
                taken = await presence_store.taken_seats(exclude_id=participant.id)
                preferred = message.get("seat")
                seat = allocate_seat(taken, preferred)
                if seat is None:
                    await websocket.send_json(
                        {
                            "type": "sit_denied",
                            "reason": "The bench is full right now.",
                        }
                    )
                    continue

                participant.seated = True
                participant.seat = seat
                participant.updated_at = time.time()
                await presence_store.upsert(participant)
                await announce({"type": "presence", "user": serialize_user(participant)})

            elif message_type == "stand":
                participant.seated = False
                participant.seat = None
                participant.typing = ""
                participant.updated_at = time.time()
                await presence_store.upsert(participant)
                await announce({"type": "presence", "user": serialize_user(participant)})

            elif message_type == "attack":
                await start_attack(presence_store, participant, message.get("target"))
    except WebSocketDisconnect:
        pass
    finally:
        async with clients_lock:
            clients.pop(participant.id, None)
            if local_participants.get(participant.id) is participant:
                local_participants.pop(participant.id, None)

        await cancel_cursor_snapshot(participant.id)
        await presence_store.remove(participant.id)
        await announce({"type": "leave", "id": participant.id})


@router.get("/api/presence")
async def presence_snapshot():
    presence_store = await get_store()
    users = await presence_store.snapshot()

    return {"stateStore": presence_store.label, "users": users, "total": len(users)}


async def get_store() -> PresenceStore:
    global store

    async with store_lock:
        if store is not None:
            return store

        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            redis_store = RedisPresenceStore(redis_url)
            await redis_store.connect()
            store = redis_store
        else:
            store = InMemoryPresenceStore()

        logger.info("Collaboration persistence backend: %s", store.label)
        return store


async def announce(payload: dict[str, Any], skip_id: str | None = None) -> None:
    await broadcast(payload, skip_id=skip_id)
    await (await get_store()).publish(payload)


async def announce_realtime(
    presence_store: PresenceStore, payload: dict[str, Any], skip_id: str | None = None
) -> None:
    await broadcast(payload, skip_id=skip_id)
    schedule_background(
        presence_store.publish(payload), "publish realtime presence event"
    )


async def handle_remote_event(payload: dict[str, Any]) -> None:
    if payload.get("type") == "attack_request":
        await resolve_attack(payload)
        return

    await broadcast(payload)


async def start_attack(
    presence_store: PresenceStore, attacker: Participant, target_id: Any
) -> None:
    now = time.time()
    if (
        not isinstance(target_id, str)
        or target_id == attacker.id
        or attacker.ghost
        or attacker.seated
        or now - attacker.last_attack_at < HIT_COOLDOWN_SECONDS
    ):
        return

    attacker.last_attack_at = now
    if now > attacker.battle_until:
        attacker.hp = MAX_HP

    request = {
        "type": "attack_request",
        "attacker": serialize_user(attacker),
        "targetId": target_id,
        "damage": random.randint(*HIT_DAMAGE_RANGE),
    }

    if target_id in local_participants:
        await resolve_attack(request)
    else:
        # The target's socket may live on another instance; let it decide.
        await presence_store.publish(request)


async def resolve_attack(request: dict[str, Any]) -> None:
    target = local_participants.get(request.get("targetId"))
    attacker = request.get("attacker")
    damage = request.get("damage")
    if (
        target is None
        or not isinstance(attacker, dict)
        or not isinstance(damage, int)
        or target.id == attacker.get("id")
        or target.seated
        or target.ghost
    ):
        return

    distance = math.hypot(
        target.x - clamp_float(attacker.get("x"), fallback=-1),
        target.y - clamp_float(attacker.get("y"), fallback=-1),
    )
    if distance > HIT_RANGE:
        return

    now = time.time()
    if now > target.battle_until:
        target.hp = MAX_HP
    target.battle_until = now + BATTLE_SECONDS
    target.hp = max(target.hp - damage, 0)
    knocked_out = target.hp == 0
    if knocked_out:
        target.ghost = True
        target.typing = ""
    target.updated_at = now

    local_attacker = local_participants.get(attacker.get("id"))
    if local_attacker is not None:
        local_attacker.battle_until = now + BATTLE_SECONDS

    await (await get_store()).upsert(target)
    await announce(
        {
            "type": "hit",
            "attacker": attacker,
            "target": serialize_user(target),
            "damage": damage,
            "ko": knocked_out,
        }
    )

    if knocked_out:
        schedule_background(respawn(target), "respawn knocked out participant")


async def respawn(participant: Participant) -> None:
    await asyncio.sleep(GHOST_SECONDS)
    if local_participants.get(participant.id) is not participant:
        return

    participant.ghost = False
    participant.hp = MAX_HP
    participant.battle_until = 0
    participant.updated_at = time.time()
    await (await get_store()).upsert(participant)
    await announce({"type": "presence", "user": serialize_user(participant)})


async def broadcast(payload: dict[str, Any], skip_id: str | None = None) -> None:
    stale_client_ids: list[str] = []

    async with clients_lock:
        active_clients = list(clients.items())

    for participant_id, websocket in active_clients:
        if participant_id == skip_id:
            continue

        try:
            await websocket.send_json(payload)
        except Exception:
            stale_client_ids.append(participant_id)

    if stale_client_ids:
        async with clients_lock:
            for participant_id in stale_client_ids:
                clients.pop(participant_id, None)


async def schedule_cursor_snapshot(
    presence_store: PresenceStore, participant: Participant
) -> None:
    if presence_store.label == "memory":
        return

    async with cursor_snapshot_lock:
        task = cursor_snapshot_tasks.get(participant.id)
        if task and not task.done():
            return

        cursor_snapshot_tasks[participant.id] = schedule_background(
            persist_cursor_snapshot(presence_store, participant),
            "persist throttled cursor snapshot",
        )


async def persist_cursor_snapshot(
    presence_store: PresenceStore, participant: Participant
) -> None:
    try:
        await asyncio.sleep(CURSOR_SNAPSHOT_INTERVAL_SECONDS)
        await presence_store.upsert(participant)
    finally:
        current_task = asyncio.current_task()
        async with cursor_snapshot_lock:
            if cursor_snapshot_tasks.get(participant.id) is current_task:
                cursor_snapshot_tasks.pop(participant.id, None)


async def cancel_cursor_snapshot(participant_id: str) -> None:
    async with cursor_snapshot_lock:
        task = cursor_snapshot_tasks.pop(participant_id, None)

    if task:
        task.cancel()


def schedule_background(coro: Any, description: str) -> asyncio.Task[None]:
    task = asyncio.create_task(coro)
    # The event loop only keeps weak references to tasks.
    background_tasks.add(task)

    def log_error(completed_task: asyncio.Task[None]) -> None:
        background_tasks.discard(completed_task)
        if completed_task.cancelled():
            return

        error = completed_task.exception()
        if error:
            logger.error(
                "Background collaboration task failed: %s",
                description,
                exc_info=(type(error), error, error.__traceback__),
            )

    task.add_done_callback(log_error)
    return task


def allocate_seat(taken: set[int], preferred: Any) -> int | None:
    if isinstance(preferred, int) and 0 <= preferred < MAX_SEATS and preferred not in taken:
        return preferred

    for seat in range(MAX_SEATS):
        if seat not in taken:
            return seat

    return None


def parse_message(raw_message: Any) -> dict[str, Any] | None:
    if isinstance(raw_message, bytes):
        raw_message = raw_message.decode("utf-8")

    if not isinstance(raw_message, str):
        return None

    try:
        message = json.loads(raw_message)
    except json.JSONDecodeError:
        return None

    return message if isinstance(message, dict) else None


def serialize_user(participant: Participant) -> dict[str, Any]:
    payload = asdict(participant)
    payload["updatedAt"] = payload.pop("updated_at")
    for field in PRIVATE_FIELDS:
        payload.pop(field, None)
    return payload


def clean_text(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback

    cleaned = value.strip()[:40]
    return cleaned or fallback


def clean_typing(value: Any) -> str:
    if not isinstance(value, str):
        return ""

    return value[:120]


def clean_color(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback

    value = value.strip()
    is_hex = len(value) == 7 and value.startswith("#")
    if is_hex and all(char in "0123456789abcdefABCDEF" for char in value[1:]):
        return value

    return fallback


def clamp_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback

    return min(max(number, 0), 1)

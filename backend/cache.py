"""
Tiny in-process async-safe TTL cache.

Why this exists:
- TMDB enrichment (poster/backdrop lookups) is the same for a given title
  regardless of which user asks for it, but it was being re-fetched from
  the network on every request.
- Deterministic list endpoints (trending, popular, top-rated, genres, ...)
  recompute the same pandas slice on every request even though the
  underlying dataset only changes on deploy/reload.

This cache is intentionally simple (no Redis dependency) so it works
out of the box. If you run multiple worker processes, swap this for
Redis using the same get_or_set interface.
"""
import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, Hashable, Tuple


class TTLCache:
    def __init__(self, default_ttl: float = 300.0, max_entries: int = 5000):
        self._store: Dict[Hashable, Tuple[float, Any]] = {}
        self._locks: Dict[Hashable, asyncio.Lock] = {}
        self._default_ttl = default_ttl
        self._max_entries = max_entries

    def _evict_if_full(self) -> None:
        if len(self._store) <= self._max_entries:
            return
        # Drop the oldest ~10% of entries by expiry time.
        oldest = sorted(self._store.items(), key=lambda kv: kv[1][0])
        for k, _ in oldest[: max(1, self._max_entries // 10)]:
            self._store.pop(k, None)

    def get_sync(self, key: Hashable):
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            self._store.pop(key, None)
            return None
        return value

    def set_sync(self, key: Hashable, value: Any, ttl: float = None) -> None:
        self._evict_if_full()
        self._store[key] = (time.monotonic() + (ttl or self._default_ttl), value)

    async def get_or_set(
        self,
        key: Hashable,
        factory: Callable[[], Awaitable[Any]],
        ttl: float = None,
    ) -> Any:
        """Cache an async factory's result. Concurrent callers for the same
        missing key share one in-flight call instead of stampeding the
        upstream source (important for TMDB rate limits)."""
        cached = self.get_sync(key)
        if cached is not None:
            return cached

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            # Re-check: another coroutine may have populated it while we waited.
            cached = self.get_sync(key)
            if cached is not None:
                return cached
            value = await factory()
            self.set_sync(key, value, ttl)
            self._locks.pop(key, None)
            return value

    async def get_or_set_variable_ttl(
        self,
        key: Hashable,
        factory: Callable[[], Awaitable[Tuple[Any, float]]],
    ) -> Any:
        """Like get_or_set, but factory returns (value, ttl) so callers can
        cache different outcomes for different durations — e.g. a genuine
        TMDB match for 6h, but a failed/errored lookup for only 1min so we
        retry soon instead of pinning a transient failure in place."""
        cached = self.get_sync(key)
        if cached is not None:
            return cached

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self.get_sync(key)
            if cached is not None:
                return cached
            value, ttl = await factory()
            self.set_sync(key, value, ttl)
            self._locks.pop(key, None)
            return value


# Shared caches, tuned per data volatility.
tmdb_cache = TTLCache(default_ttl=6 * 60 * 60)      # poster/backdrop data barely changes: 6h
listing_cache = TTLCache(default_ttl=5 * 60)         # trending/popular/etc: 5min
daily_pick_cache = TTLCache(default_ttl=60 * 60)     # recomputed once per hour, keyed by date
import asyncio
import logging
import os
from typing import Optional, Tuple

import httpx
from dotenv import load_dotenv

from .cache import tmdb_cache

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API")
TMDB_BASE = os.getenv("TMDB_BASE")
IMG_BASE = os.getenv("IMG_BASE")
TMDB_ACTRESS_BASE = os.getenv("TMDB_ACTRESS_BASE")

logger = logging.getLogger(__name__)

CACHE_TTL = 60 * 60 * 6        # 6 hours for genuine results (including "no match")
ERROR_CACHE_TTL = 60           # 1 minute for errors/failures, so we retry soon

_EMPTY = {
    "poster_url": None, "backdrop_url": None, "release_date": None,
    "runtime": None, "cast": [], "director": None, "trailer_key": None,
    "tmdb_id": None,
}

# ---------------------------------------------------------------------------
# Reused, connection-pooled client.
#
# Previously a brand new httpx.AsyncClient (new TCP connection + TLS
# handshake) was opened and torn down on *every single call*. That's the
# single biggest source of latency for enrichment, especially now that
# main.py fires many concurrent enrich_by_title() calls via asyncio.gather.
# One shared client with keep-alive connections reuses sockets across calls.
# ---------------------------------------------------------------------------
_client: Optional[httpx.AsyncClient] = None

# TMDB enforces a rolling rate limit; cap how many requests we have in
# flight at once so a burst of concurrent enrichment (e.g. a 40-title
# /api/enrich batch) doesn't trip 429s.
_semaphore = asyncio.Semaphore(15)


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        headers = {"accept": "application/json"}
        if TMDB_API_KEY:
            headers["Authorization"] = f"Bearer {TMDB_API_KEY}"
        _client = httpx.AsyncClient(
            timeout=6.0,
            headers=headers,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _client


async def close_client() -> None:
    """Call this from the app's shutdown hook to release pooled connections
    cleanly instead of leaking sockets on process exit."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _fetch_from_tmdb(title: str) -> Tuple[dict, float]:
    """Actual network call. Only ever invoked on a cache miss — concurrent
    callers for the same title share one in-flight request via the cache's
    lock, so this never runs twice in parallel for the same title."""
    client = get_client()

    async with _semaphore:
        try:
            search_resp = await client.get(
                f"{TMDB_BASE}/search/movie",
                params={"query": title},
            )
            search_resp.raise_for_status()
            results = search_resp.json().get("results", [])
            if not results:
                logger.info("TMDB: no results for %r", title)
                return _EMPTY, CACHE_TTL

            movie = results[0]
            tmdb_id = movie["id"]

            details_resp = await client.get(
                f"{TMDB_BASE}/movie/{tmdb_id}",
                params={"append_to_response": "credits,videos"},
            )
            details_resp.raise_for_status()
            d = details_resp.json()

            cast = [c["name"] for c in d.get("credits", {}).get("cast", [])[:6]]
            crew = d.get("credits", {}).get("crew", [])
            director = next((c["name"] for c in crew if c.get("job") == "Director"), None)
            trailer = next(
                (v["key"] for v in d.get("videos", {}).get("results", [])
                 if v.get("site") == "YouTube" and v.get("type") == "Trailer"),
                None,
            )

            poster_path = d.get("poster_path")
            backdrop_path = d.get("backdrop_path")

            out = {
                "tmdb_id": tmdb_id,
                "poster_url": f"{IMG_BASE}/w500{poster_path}" if poster_path else None,
                "backdrop_url": f"{IMG_BASE}/original{backdrop_path}" if backdrop_path else None,
                "release_date": d.get("release_date"),
                "runtime": d.get("runtime"),
                "cast": cast,
                "director": director,
                "trailer_key": trailer,
            }

            logger.info(
                "TMDB enrich success for %r -> id=%s poster=%s",
                title, tmdb_id, out["poster_url"],
            )
            return out, CACHE_TTL

        except httpx.HTTPStatusError as e:
            logger.warning(
                "TMDB HTTP %s for %r: %s",
                e.response.status_code, title, e.response.text[:300],
            )
            return _EMPTY, ERROR_CACHE_TTL

        except httpx.HTTPError as e:
            logger.warning("TMDB request failed for %r: %s", title, e)
            return _EMPTY, ERROR_CACHE_TTL

        except (KeyError, IndexError) as e:
            logger.warning("TMDB response shape unexpected for %r: %s", title, e)
            return _EMPTY, ERROR_CACHE_TTL


async def enrich_by_title(title: str) -> dict:
    """Returns poster/backdrop/runtime/release_date/cast/director/trailer for a
    title, or an empty-ish dict with placeholders if TMDB has no match / the
    key isn't configured / the network call fails.

    Cached (success 6h, failure 1min) with stampede protection: if 20
    requests ask for the same uncached title at once, only one network
    call goes out and the rest wait on it, instead of firing 20 identical
    requests at TMDB.
    """
    if not TMDB_API_KEY:
        logger.warning("TMDB_API env var is not set; skipping enrichment for %r", title)
        return dict(_EMPTY)

    key = ("tmdb_title", title)

    async def factory() -> Tuple[dict, float]:
        return await _fetch_from_tmdb(title)

    result = await tmdb_cache.get_or_set_variable_ttl(key, factory)
    # Return a shallow copy so a caller mutating the dict/list they got back
    # (e.g. movie.update(...) downstream) never corrupts the cached entry
    # shared by every other request for this title.
    out = dict(result)
    if "cast" in out and isinstance(out["cast"], list):
        out["cast"] = list(out["cast"])
    return out
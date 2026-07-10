import logging
import os
import time
import httpx
from dotenv import load_dotenv

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API")
TMDB_BASE = os.getenv("TMDB_BASE")
IMG_BASE = os.getenv("IMG_BASE")
TMDB_ACTRESS_BASE = os.getenv("TMDB_ACTRESS_BASE")

logger = logging.getLogger(__name__)

# result cache: key -> (timestamp, value, ttl)
_cache: dict[str, tuple[float, dict, float]] = {}
CACHE_TTL = 60 * 60 * 6        # 6 hours for genuine results (including "no match")
ERROR_CACHE_TTL = 60           # 1 minute for errors/failures, so we retry soon


def _cached(key: str):
    hit = _cache.get(key)
    if hit and (time.time() - hit[0]) < hit[2]:
        return hit[1]
    return None


def _store(key: str, value: dict, ttl: float = CACHE_TTL):
    _cache[key] = (time.time(), value, ttl)


async def enrich_by_title(title: str) -> dict:
    """Returns poster/backdrop/runtime/release_date/cast/director/trailer for a
    title, or an empty-ish dict with placeholders if TMDB has no match / the
    key isn't configured / the network call fails."""
    empty = {
        "poster_url": None, "backdrop_url": None, "release_date": None,
        "runtime": None, "cast": [], "director": None, "trailer_key": None,
        "tmdb_id": None,
    }

    if not TMDB_API_KEY:
        logger.warning("TMDB_API env var is not set; skipping enrichment for %r", title)
        return empty

    cached = _cached(title)
    if cached is not None:
        return cached

    headers = {
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
            search_resp = await client.get(
                f"{TMDB_BASE}/search/movie",
                params={"query": title},
            )
            search_resp.raise_for_status()
            results = search_resp.json().get("results", [])
            if not results:
                logger.info("TMDB: no results for %r", title)
                _store(title, empty)
                return empty

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
            _store(title, out)
            return out

    except httpx.HTTPStatusError as e:
        logger.warning(
            "TMDB HTTP %s for %r: %s",
            e.response.status_code, title, e.response.text[:300],
        )
        _store(title, empty, ttl=ERROR_CACHE_TTL)
        return empty

    except httpx.HTTPError as e:
        logger.warning("TMDB request failed for %r: %s", title, e)
        _store(title, empty, ttl=ERROR_CACHE_TTL)
        return empty

    except (KeyError, IndexError) as e:
        logger.warning("TMDB response shape unexpected for %r: %s", title, e)
        _store(title, empty, ttl=ERROR_CACHE_TTL)
        return empty
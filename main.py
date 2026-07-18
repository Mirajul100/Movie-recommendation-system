import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend import auth
from backend import recommender as rec
from backend import tmdb
from backend import models
from backend import schemas
from backend.cache import listing_cache, daily_pick_cache
from backend.database import engine, get_db, Base

# Use orjson for faster JSON encoding when available; fall back silently
# to FastAPI's default encoder otherwise (no hard dependency required).
#
# NOTE: importing `fastapi.responses.ORJSONResponse` never raises
# ImportError even when orjson isn't installed -- FastAPI only checks for
# orjson lazily inside .render(), via an `assert`, which blows up on the
# *first real request* instead of at startup. So we must probe for the
# `orjson` package itself, not the response class, to pick correctly.
try:
    import orjson  # noqa: F401
    from fastapi.responses import ORJSONResponse as _FastResponse
except ImportError:  # orjson not installed
    from fastapi.responses import JSONResponse as _FastResponse

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Release the pooled TMDB HTTP connections cleanly on shutdown instead
    # of leaking sockets when the process exits.
    await tmdb.close_client()


app = FastAPI(
    title="MovieBD API",
    version="1.1.0",
    default_response_class=_FastResponse,
    lifespan=lifespan,
)

# Compresses JSON/HTML/static payloads over ~500 bytes -> smaller transfer,
# faster perceived load, especially on slower mobile connections.
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # replace with your real frontend origin(s)
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def enrich_movies_concurrently(movies: List[dict]) -> List[dict]:
    """Enrich a list of movie dicts with TMDB poster/backdrop data in
    parallel instead of one-await-at-a-time. Caching + stampede protection
    for repeated/concurrent lookups of the same title already happens
    inside tmdb.enrich_by_title, so this just fans the calls out."""

    async def enrich_one(movie: dict) -> dict:
        data = await tmdb.enrich_by_title(movie["title"])
        movie.update(data or {})
        return movie

    return list(await asyncio.gather(*(enrich_one(m) for m in movies)))


def cached_listing(cache_key, ttl=None):
    """Decorator for pure, deterministic list endpoints (trending, popular,
    genres, ...) whose results only change when the dataset reloads."""

    def decorator(fn):
        async def wrapper(*args, **kwargs):
            key = (cache_key, args, tuple(sorted(kwargs.items())))

            async def factory():
                return fn(*args, **kwargs)

            return await listing_cache.get_or_set(key, factory, ttl)

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.post("/api/auth/signup", response_model=schemas.Token)
def signup(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(
        (models.User.username == payload.username) | (models.User.email == payload.email)
    ).first():
        raise HTTPException(400, "Username or email already registered")
    user = models.User(
        username=payload.username,
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        is_admin=(db.query(models.User).count() == 0),  # first user becomes admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth.create_access_token({"sub": user.username})
    return {"access_token": token, "user": user}


@app.post("/api/auth/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Incorrect username or password")
    token = auth.create_access_token({"sub": user.username})
    return {"access_token": token, "user": user}


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(auth.get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Discovery / browse endpoints
# ---------------------------------------------------------------------------
@app.get("/api/search")
async def search(q: str, limit: int = Query(8, ge=1, le=40)):
    movies = rec.search_titles(q, limit)
    return await enrich_movies_concurrently(movies)


@app.get("/api/genres")
async def genres():
    async def factory():
        return rec.list_genres()

    return await listing_cache.get_or_set("genres", factory, ttl=60 * 60)


@app.get("/api/genre/{genre}")
async def genre_movies(genre: str, limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.search_by_genre(genre, limit=limit, offset=offset)

    return await listing_cache.get_or_set(("genre", genre, limit, offset), factory)

@app.get("/api/new-releases")
async def new_releases(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        titles = await tmdb.get_now_playing_titles(pages=2)
        return rec.new_releases_from_titles(titles, limit=limit, offset=offset)

    # Shorter TTL than the other listing endpoints since TMDB's now-playing
    # data is time-sensitive and should refresh more often than static
    # local-dataset rankings like trending/top-rated.
    return await listing_cache.get_or_set(
        ("new_releases", limit, offset), factory, ttl=60 * 60 * 6
    )

@app.get("/api/trending")
async def trending(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.trending(limit=limit, offset=offset)

    return await listing_cache.get_or_set(("trending", limit, offset), factory)


@app.get("/api/top-rated")
async def top_rated(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.top_rated(limit=limit, offset=offset)

    return await listing_cache.get_or_set(("top_rated", limit, offset), factory)


@app.get("/api/popular")
async def popular(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.popular(limit=limit, offset=offset)

    return await listing_cache.get_or_set(("popular", limit, offset), factory)


@app.get("/api/hidden-gems")
async def hidden_gems(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.hidden_gems(limit=limit, offset=offset)

    return await listing_cache.get_or_set(("hidden_gems", limit, offset), factory)


@app.get("/api/award-winners")
async def award_winners(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.award_winners(limit=limit, offset=offset)

    return await listing_cache.get_or_set(("award_winners", limit, offset), factory)


@app.get("/api/family-friendly")
async def family_friendly(limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.family_friendly(limit=limit, offset=offset)

    return await listing_cache.get_or_set(("family_friendly", limit, offset), factory)


@app.get("/api/mood/{mood}")
async def mood(mood: str, limit: int = Query(24, ge=1, le=100), offset: int = 0):
    async def factory():
        return rec.by_mood(mood, limit=limit, offset=offset)

    results = await listing_cache.get_or_set(("mood", mood, limit, offset), factory)
    if not results and mood.lower() not in rec.MOOD_TO_GENRES:
        raise HTTPException(404, f"Unknown mood '{mood}'. Try: {list(rec.MOOD_TO_GENRES)}")
    return results


@app.get("/api/random")
def random_movie():
    return rec.random_movie()


@app.get("/api/movie/{movie_id}")
async def movie_detail(movie_id: int):
    movie = rec.get_movie_by_id(movie_id)
    if not movie:
        raise HTTPException(404, "Movie not found")

    enrichment = await tmdb.enrich_by_title(movie["title"])
    return {**movie, **(enrichment or {})}


@app.get("/api/enrich")
async def enrich_batch(titles: str):
    """Batch poster/backdrop lookup for a pipe-separated list of titles, used
    to fill in a visible grid of movie cards without one request per card."""
    title_list = [t for t in titles.split("|") if t][:40]
    results = await asyncio.gather(*(tmdb.enrich_by_title(t) for t in title_list))
    return dict(zip(title_list, results))


@app.get("/api/recommend/{movie_id}")
async def recommend_similar(movie_id: int, limit: int = Query(12, ge=1, le=50)):
    movie = rec.get_movie_by_id(movie_id)
    if not movie:
        raise HTTPException(404, "Movie not found")

    async def factory():
        return rec.recommend(movie["title"], top_n=limit)

    return await listing_cache.get_or_set(("recommend", movie_id, limit), factory, ttl=30 * 60)


@app.post("/api/compare")
def compare(payload: schemas.CompareRequest):
    result = rec.compare_movies(payload.title_a, payload.title_b)
    if not result:
        raise HTTPException(404, "One or both titles not found")
    return result


@app.post("/api/friend-match")
def friend_match(payload: schemas.CompareRequest):
    result = rec.friend_match(payload.title_a, payload.title_b)
    if result is None:
        raise HTTPException(404, "One or both titles not found")
    return result


@app.post("/api/chatbot")
async def chatbot(payload: schemas.ChatRequest):
    data = rec.chatbot_recommend(payload.message)
    data["results"] = await enrich_movies_concurrently(data["results"])
    return data


@app.get("/api/daily-pick")
async def daily_pick():
    # Deterministic per calendar day (UTC), and now actually cached so we
    # don't rescan/filter the whole DataFrame on every single request.
    today_key = datetime.now(timezone.utc).strftime("%Y%m%d")

    async def factory():
        seed = int(today_key)
        subset = rec.DF[rec.DF["vote_average"] >= 7]
        if subset.empty:
            subset = rec.DF
        row = subset.iloc[seed % len(subset)]
        return rec.movie_to_dict(row)

    return await daily_pick_cache.get_or_set(("daily_pick", today_key), factory)


# ---------------------------------------------------------------------------
# Personalization (requires login)
# ---------------------------------------------------------------------------
@app.post("/api/favorites")
def add_favorite(payload: schemas.MovieRef, user: models.User = Depends(auth.get_current_user),
                  db: Session = Depends(get_db)):
    existing = db.query(models.Favorite).filter_by(user_id=user.id, movie_id=payload.movie_id).first()
    if existing:
        return {"status": "already added"}
    db.add(models.Favorite(user_id=user.id, movie_id=payload.movie_id, movie_title=payload.movie_title))
    db.commit()
    return {"status": "added"}


@app.delete("/api/favorites/{movie_id}")
def remove_favorite(movie_id: int, user: models.User = Depends(auth.get_current_user),
                     db: Session = Depends(get_db)):
    db.query(models.Favorite).filter_by(user_id=user.id, movie_id=movie_id).delete()
    db.commit()
    return {"status": "removed"}


@app.get("/api/favorites")
def list_favorites(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Favorite).filter_by(user_id=user.id).all()


@app.post("/api/watchlist")
def add_watchlist(payload: schemas.MovieRef, user: models.User = Depends(auth.get_current_user),
                   db: Session = Depends(get_db)):
    existing = db.query(models.WatchlistItem).filter_by(user_id=user.id, movie_id=payload.movie_id).first()
    if existing:
        return {"status": "already added"}
    db.add(models.WatchlistItem(user_id=user.id, movie_id=payload.movie_id, movie_title=payload.movie_title))
    db.commit()
    return {"status": "added"}


@app.delete("/api/watchlist/{movie_id}")
def remove_watchlist(movie_id: int, user: models.User = Depends(auth.get_current_user),
                      db: Session = Depends(get_db)):
    db.query(models.WatchlistItem).filter_by(user_id=user.id, movie_id=movie_id).delete()
    db.commit()
    return {"status": "removed"}


@app.get("/api/watchlist")
def list_watchlist(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.WatchlistItem).filter_by(user_id=user.id).all()


@app.post("/api/history")
def log_history(payload: schemas.HistoryCreate, user: models.User = Depends(auth.get_current_user),
                 db: Session = Depends(get_db)):
    db.add(models.WatchHistory(user_id=user.id, movie_id=payload.movie_id,
                                movie_title=payload.movie_title, progress_pct=payload.progress_pct))
    db.commit()
    return {"status": "logged"}


@app.get("/api/history/recent")
def recent_history(limit: int = 12, user: models.User = Depends(auth.get_current_user),
                    db: Session = Depends(get_db)):
    return (db.query(models.WatchHistory).filter_by(user_id=user.id)
            .order_by(models.WatchHistory.viewed_at.desc()).limit(limit).all())


@app.get("/api/history/continue-watching")
def continue_watching(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return (db.query(models.WatchHistory).filter_by(user_id=user.id)
            .filter(models.WatchHistory.progress_pct < 100)
            .order_by(models.WatchHistory.viewed_at.desc()).limit(12).all())


@app.get("/api/recommended-for-you")
def recommended_for_you(user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """
    Improved personalization signal:
    - Blends favorites (strongest signal), high star-ratings, and recent
      watch history instead of only ever looking at up to 5 favorites.
    - Weights each seed title so favorites/high-ratings count more than
      a title someone merely started watching.
    - Falls back to trending only when the user truly has zero signal.
    """
    favorites = (db.query(models.Favorite)
                 .filter_by(user_id=user.id)
                 .order_by(models.Favorite.id.desc()).limit(8).all())
    top_ratings = (db.query(models.Rating)
                    .filter(models.Rating.user_id == user.id, models.Rating.stars >= 4)
                    .order_by(models.Rating.id.desc()).limit(8).all())
    recent_history_rows = (db.query(models.WatchHistory)
                            .filter_by(user_id=user.id)
                            .order_by(models.WatchHistory.viewed_at.desc()).limit(8).all())

    # weight: favorites > high ratings > recently watched, de-duplicated
    # while preserving the highest weight seen for each title.
    weighted: dict[str, float] = {}
    for f in favorites:
        weighted[f.movie_title] = max(weighted.get(f.movie_title, 0), 3.0)
    for r in top_ratings:
        weighted[r.movie_title] = max(weighted.get(r.movie_title, 0), 2.0 + (r.stars - 4) * 0.5)
    for h in recent_history_rows:
        weighted[h.movie_title] = max(weighted.get(h.movie_title, 0), 1.0)

    if not weighted:
        return {"basis": "trending (add favorites to personalize this)", "results": rec.trending(limit=12)}

    seed_titles = [t for t, _ in sorted(weighted.items(), key=lambda kv: kv[1], reverse=True)][:8]

    basis_source = favorites[0].movie_title if favorites else seed_titles[0]
    return {
        "basis": f"because you liked {basis_source}"
                 + (f" and {len(seed_titles) - 1} more" if len(seed_titles) > 1 else ""),
        "results": rec.recommend_with_explanation(seed_titles, top_n=12),
    }


@app.post("/api/ratings")
def rate_movie(payload: schemas.RatingCreate, user: models.User = Depends(auth.get_current_user),
                db: Session = Depends(get_db)):
    existing = db.query(models.Rating).filter_by(user_id=user.id, movie_id=payload.movie_id).first()
    if existing:
        existing.stars = payload.stars
    else:
        db.add(models.Rating(user_id=user.id, movie_id=payload.movie_id,
                              movie_title=payload.movie_title, stars=payload.stars))
    db.commit()
    return {"status": "rated"}


@app.post("/api/reviews")
def add_review(payload: schemas.ReviewCreate, user: models.User = Depends(auth.get_current_user),
               db: Session = Depends(get_db)):
    review = models.Review(user_id=user.id, movie_id=payload.movie_id,
                            movie_title=payload.movie_title, body=payload.body)
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@app.get("/api/reviews/{movie_id}")
def get_reviews(movie_id: int, db: Session = Depends(get_db)):
    # Single joined query instead of one extra SELECT per review (N+1 fix).
    rows = (
        db.query(models.Review, models.User.username)
        .outerjoin(models.User, models.User.id == models.Review.user_id)
        .filter(models.Review.movie_id == movie_id)
        .order_by(models.Review.created_at.desc())
        .all()
    )
    return [
        {
            "id": review.id,
            "body": review.body,
            "created_at": review.created_at,
            "username": username or "deleted user",
        }
        for review, username in rows
    ]


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
def require_admin(user: models.User = Depends(auth.get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return user


@app.get("/api/admin/stats")
def admin_stats(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "total_users": db.query(models.User).count(),
        "total_movies": len(rec.DF),
        "total_favorites": db.query(models.Favorite).count(),
        "total_reviews": db.query(models.Review).count(),
        "total_ratings": db.query(models.Rating).count(),
        "total_searches": db.query(models.SearchLog).count(),
    }


@app.get("/api/admin/top-searches")
def top_searches(limit: int = 20, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = (db.query(models.SearchLog.query, func.count(models.SearchLog.id).label("count"))
            .group_by(models.SearchLog.query).order_by(func.count(models.SearchLog.id).desc())
            .limit(limit).all())
    return [{"query": q, "count": c} for q, c in rows]


@app.get("/api/admin/users")
def list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.User).all()


@app.get("/api/admin/reviews")
def all_reviews(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.Review).order_by(models.Review.created_at.desc()).limit(200).all()


@app.delete("/api/admin/reviews/{review_id}")
def delete_review(review_id: int, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    db.query(models.Review).filter_by(id=review_id).delete()
    db.commit()
    return {"status": "deleted"}


@app.get("/api/health")
def health():
    return {"status": "ok", "movies_loaded": len(rec.DF)}


# ---------------------------------------------------------------------------
# Static frontend with long-lived cache headers for hashed build assets.
# ---------------------------------------------------------------------------
class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        # index.html must revalidate so deploys show up immediately; other
        # build assets (js/css/images, usually content-hashed) can be
        # cached hard by the browser/CDN for a much faster repeat load.
        if path.endswith("index.html") or path == "":
            response.headers["Cache-Control"] = "no-cache"
        else:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
app.mount("/", CachedStaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
import asyncio
from datetime import datetime
from typing import Optional
import os

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend import auth
from backend import recommender as rec
from backend import tmdb
from backend import models
from backend import schemas
from backend.database import engine, get_db, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MovieBD API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # replace with your real frontend origin(s)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
def search(q: str = Query(min_length=1), limit: int = 10, db: Session = Depends(get_db)):
    db.add(models.SearchLog(query=q))
    db.commit()
    return rec.search_titles(q, limit=limit)


@app.get("/api/genres")
def genres():
    return rec.list_genres()

@app.get("/api/genre/{genre}")
def genre_movies(genre: str, limit: int = 24, offset: int = 0):
    return rec.search_by_genre(genre, limit=limit, offset=offset)

@app.get("/api/trending")
def trending(limit: int = 24, offset: int = 0):
    return rec.trending(limit=limit, offset=offset)

@app.get("/api/top-rated")
def top_rated(limit: int = 24, offset: int = 0):
    return rec.top_rated(limit=limit, offset=offset)

@app.get("/api/popular")
def popular(limit: int = 24, offset: int = 0):
    return rec.popular(limit=limit, offset=offset)

@app.get("/api/hidden-gems")
def hidden_gems(limit: int = 24, offset: int = 0):
    return rec.hidden_gems(limit=limit, offset=offset)

@app.get("/api/award-winners")
def award_winners(limit: int = 24, offset: int = 0):
    return rec.award_winners(limit=limit, offset=offset)

@app.get("/api/family-friendly")
def family_friendly(limit: int = 24, offset: int = 0):
    return rec.family_friendly(limit=limit, offset=offset)

@app.get("/api/mood/{mood}")
def mood(mood: str, limit: int = 24, offset: int = 0):
    results = rec.by_mood(mood, limit=limit, offset=offset)
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
    return {**movie, **enrichment}

@app.get("/api/enrich")
async def enrich_batch(titles: str):
    """Batch poster/backdrop lookup for a pipe-separated list of titles, used
    to fill in a visible grid of movie cards without one request per card."""
    title_list = [t for t in titles.split("|") if t][:40]
    results = await asyncio.gather(*(tmdb.enrich_by_title(t) for t in title_list))
    return dict(zip(title_list, results))

@app.get("/api/recommend/{movie_id}")
def recommend_similar(movie_id: int, limit: int = 12):
    movie = rec.get_movie_by_id(movie_id)
    if not movie:
        raise HTTPException(404, "Movie not found")
    return rec.recommend(movie["title"], top_n=limit)

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
def chatbot(payload: schemas.ChatRequest):
    return rec.chatbot_recommend(payload.message)

@app.get("/api/daily-pick")
def daily_pick():
    # Deterministic per calendar day so it doesn't change on refresh.
    seed = int(datetime.utcnow().strftime("%Y%m%d"))
    subset = rec.DF[rec.DF["vote_average"] >= 7]
    if subset.empty:
        subset = rec.DF
    row = subset.iloc[seed % len(subset)]
    return rec.movie_to_dict(row)


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
    seed_titles = [f.movie_title for f in db.query(models.Favorite).filter_by(user_id=user.id).limit(5)]
    if not seed_titles:
        seed_titles = [h.movie_title for h in
                       db.query(models.WatchHistory).filter_by(user_id=user.id)
                       .order_by(models.WatchHistory.viewed_at.desc()).limit(5)]
    if not seed_titles:
        return {"basis": "trending (add favorites to personalize this)", "results": rec.trending(limit=12)}
    return {"basis": f"because you liked {', '.join(seed_titles[:2])}",
            "results": rec.recommend_with_explanation(seed_titles, top_n=12)}


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
    reviews = db.query(models.Review).filter_by(movie_id=movie_id).order_by(models.Review.created_at.desc()).all()
    out = []
    for r in reviews:
        user = db.get(models.User, r.user_id)
        out.append({"id": r.id, "body": r.body, "created_at": r.created_at,
                    "username": user.username if user else "deleted user"})
    return out


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
    from sqlalchemy import func
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


# Serve the frontend as static files so the whole app runs from one process.
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
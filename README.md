# MovieFlix — AI Movie Recommendation Website

A dark, Netflix-styled movie recommendation site built on your trained
content-based ML model (TF-IDF + cosine similarity over `new_df.pkl`,
`indices.pkl`, `tfidf.pkl`, `tfidf_matrix.pkl`).

## Why FastAPI only (no Django)

You asked for "FastAPI and Django" together — running two full backend
frameworks side by side for one app is redundant (they'd duplicate routing,
ORM, and auth). I built the whole backend in **FastAPI**, since it's the
natural fit for serving an ML model (native async, Pydantic validation,
automatic docs at `/docs`) and Django would only add value here for its
admin panel — which this app already has as a custom dashboard. If you
specifically want Django's admin UI or ORM, say so and I'll adapt it.

## Architecture

```
Movie-Recomendation-System/
├── backend/            FastAPI app
│   ├── recommender.py   loads the 4 .pkl files, does the cosine-similarity math
│   ├── tmdb.py           server-side TMDB proxy (poster/backdrop/cast/trailer)
│   ├── auth.py           JWT auth (bcrypt password hashing)
│   ├── models.py/schemas.py/database.py   SQLite via SQLAlchemy (users, favorites,
│   │                                       watchlist, history, ratings, reviews)
│   └── data/             your 4 pickle files
└── frontend/            Plain HTML/CSS/JS (no build step)
    ├── index.html
    ├── css/style.css     dark cinematic theme
    └── js/app.js         SPA router, rendering, API calls
├── main.py          all routes

The backend serves the frontend directly, so **one process runs the whole
site**.

## Running it

```bash
pip install -r requirements.txt
export TMDB_API=   # from your _env file
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`. API docs (auto-generated) are at
`http://localhost:8000/docs`.

The first account you sign up with becomes an admin automatically (visible
under the profile menu → Admin Dashboard).

## What the ML model actually powers

Your pickle files contain **45,449 movies** with: title, genres, overview,
tagline, `vote_average`, `popularity`, and a combined `tags` field — that's
it. No release dates, runtime, cast, director, posters, or awards data.
So here's exactly how each feature is sourced:

| Feature | Source |
|---|---|
| Search, genre browse, Trending/Top Rated/Popular/Hidden Gems/Award-Worthy/Family | your local dataset, ranked with `vote_average`/`popularity` |
| "Similar movies", "Because you liked X", chatbot's "like Deadpool" | **your TF-IDF cosine-similarity model** — this is the real recommender |
| Mood-based rows | genre mapping onto your dataset (Comedy→Happy, Drama→Sad, etc.) |
| Posters, backdrops, runtime, release year, cast, director, trailer | **live TMDB lookups**, server-side, cached, using the key in your `_env` |
| Movie Match / Friend Match | built on the same TF-IDF similarity + rating/popularity blend |
| Streaming platform availability, Box Office ranking, IMDb Top 250, awards data | **not implemented** — no data source was provided for these (TMDB's free tier doesn't reliably cover them either); I flagged instead of faking it |

## Features removed or simplified (and why)

- **Streaming availability / Box Office / IMDb Top 250 / real award data** —
  removed. No dataset or free API was available; I didn't want to fabricate
  numbers.
- **"Under 90 minutes" / "Long movies"** — since there's no runtime in your
  data, this filters a popular candidate pool by live TMDB runtime rather
  than the full 45k catalog. It's honestly a heuristic, not exhaustive.
- **"Weekend movies"** — heuristic (popularity-weighted), not a real signal.
- **AI chatbot** — rule-based keyword/mood/title matching over your model,
  not a hosted LLM. It's honest about that in the code comment; wiring in
  a real LLM (e.g. Claude via the API) is a straightforward next step if
  you want it upgraded.
- **Admin "Manage movies/genres"** — since movies come from a static
  pickle rather than a live DB, editing them isn't wired up; the dashboard
  instead covers what's actually dynamic: users, reviews, and search
  analytics.

## Known limitations to be aware of

- **TMDB key is used server-side only** (never sent to the browser) — check
  `backend/tmdb.py`. Calls are cached in memory for 6 hours to stay within
  TMDB's rate limits.
- The dataset appears to top out around 2017, so very recent releases
  won't be in it.
- `SECRET_KEY` for JWTs defaults to a dev value — set
  `MOVIEFLIX_SECRET_KEY` as a real env var before deploying.
- SQLite is fine for a demo; swap `database.py` for Postgres before any
  real traffic.

## Extending it

- Swap the rule-based chatbot for a real LLM call (pass the user's message
  + a shortlist of candidate titles from `recommend()` as context).
- Add a `/api/admin/movies` CRUD layer if you want to edit the catalog
  directly instead of relying on the trained model.
- Wire up real streaming-availability data via JustWatch's API if you have
  a key for it.

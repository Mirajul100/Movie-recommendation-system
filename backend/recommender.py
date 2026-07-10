import pickle
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.sparse import load_npz
from sklearn.metrics.pairwise import linear_kernel

DATA_DIR = Path(__file__).parent / "data"

CANONICAL_GENRES = [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
    "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western",
]

MOOD_TO_GENRES = {
    "happy": ["Comedy", "Family", "Animation"],
    "sad": ["Drama"],
    "excited": ["Action", "Adventure", "Thriller"],
    "romantic": ["Romance"],
    "relaxing": ["Family", "Animation", "Documentary"],
    "inspirational": ["Drama", "History", "Documentary"],
}


def _load():
    with open(DATA_DIR / "new_df.pkl", "rb") as f:
        df = pickle.load(f)
    with open(DATA_DIR / "indices.pkl", "rb") as f:
        indices = pickle.load(f)
    with open(DATA_DIR / "tfidf.pkl", "rb") as f:
        tfidf = pickle.load(f)
    with open(DATA_DIR / "tfidf_matrix.pkl", "rb") as f:
        tfidf_matrix = pickle.load(f)

    df = df.reset_index(drop=True).copy()
    df["movie_id"] = df.index
    df["vote_average"] = df["vote_average"].fillna(0.0)
    df["popularity"] = df["popularity"].fillna(0.0)
    df["genres"] = df["genres"].fillna("")
    df["overview"] = df["overview"].fillna("")
    df["tagline"] = df["tagline"].fillna("")

    # Build a clean, de-duplicated title -> first-index lookup for fast search.
    title_to_idx = {}
    for i, t in enumerate(df["original_title"]):
        if t not in title_to_idx:
            title_to_idx[t] = i

    return df, indices, tfidf, tfidf_matrix, title_to_idx


DF, RAW_INDICES, TFIDF, TFIDF_MATRIX, TITLE_TO_IDX = _load()


def _genre_list(genre_str: str):
    found = []
    for g in CANONICAL_GENRES:
        if g in genre_str:
            found.append(g)
    return found


def movie_to_dict(row) -> dict:
    return {
        "id": int(row["movie_id"]),
        "title": row["original_title"],
        "overview": row["overview"],
        "tagline": row["tagline"],
        "vote_average": round(float(row["vote_average"]), 1),
        "popularity": round(float(row["popularity"]), 2),
        "genres": _genre_list(row["genres"]),
    }


def get_movie_by_id(movie_id: int):
    if movie_id < 0 or movie_id >= len(DF):
        return None
    return movie_to_dict(DF.iloc[movie_id])


def get_movie_by_title(title: str):
    idx = TITLE_TO_IDX.get(title)
    if idx is None:
        return None
    return movie_to_dict(DF.iloc[idx])


def search_titles(query: str, limit: int = 10):
    """Instant-search: prefix matches first, then substring matches, ranked by popularity."""
    q = query.strip().lower()
    if not q:
        return []
    mask_prefix = DF["original_title"].str.lower().str.startswith(q)
    mask_contains = DF["original_title"].str.lower().str.contains(re.escape(q), na=False)
    prefix_df = DF[mask_prefix].sort_values("popularity", ascending=False)
    contains_df = DF[mask_contains & ~mask_prefix].sort_values("popularity", ascending=False)
    result = pd.concat([prefix_df, contains_df]).head(limit)
    return [movie_to_dict(r) for _, r in result.iterrows()]


def search_by_genre(genre: str, limit: int = 30, offset: int = 0):
    mask = DF["genres"].str.contains(re.escape(genre), case=False, na=False)
    result = DF[mask].sort_values("popularity", ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def list_genres():
    return CANONICAL_GENRES


def trending(limit: int = 20, offset: int = 0):
    result = DF.sort_values("popularity", ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def top_rated(limit: int = 20, offset: int = 0, min_popularity: float = 5.0):
    # A pure vote_average sort surfaces obscure 10/10 one-vote titles, so we
    # require a modest popularity floor to keep this list credible.
    subset = DF[DF["popularity"] >= min_popularity]
    result = subset.sort_values(["vote_average", "popularity"], ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def popular(limit: int = 20, offset: int = 0):
    # Distinct from "trending" by favoring a balance of rating + popularity.
    subset = DF.copy()
    subset["score"] = subset["popularity"].rank(pct=True) * 0.6 + subset["vote_average"].rank(pct=True) * 0.4
    result = subset.sort_values("score", ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def hidden_gems(limit: int = 20, offset: int = 0):
    # High rating, low popularity = under-the-radar.
    subset = DF[(DF["vote_average"] >= 7.5) & (DF["popularity"] > 0) & (DF["popularity"] < 3)]
    result = subset.sort_values("vote_average", ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def award_winners(limit: int = 20, offset: int = 0):
    # No real award data locally, so this is a best-effort heuristic:
    # very high rating + reasonable popularity, standing in for "acclaimed".
    subset = DF[(DF["vote_average"] >= 8.0) & (DF["popularity"] >= 2)]
    result = subset.sort_values("vote_average", ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def family_friendly(limit: int = 20, offset: int = 0):
    mask = DF["genres"].str.contains("Family", na=False)
    result = DF[mask].sort_values("popularity", ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def by_mood(mood: str, limit: int = 20, offset: int = 0):
    genres = MOOD_TO_GENRES.get(mood.lower())
    if not genres:
        return []
    mask = DF["genres"].apply(lambda g: any(x in g for x in genres))
    result = DF[mask].sort_values(["vote_average", "popularity"], ascending=False).iloc[offset:offset + limit]
    return [movie_to_dict(r) for _, r in result.iterrows()]


def random_movie():
    row = DF.sample(1).iloc[0]
    return movie_to_dict(row)


def recommend(title: str, top_n: int = 12):
    """Content-based cosine-similarity recommendations against the TF-IDF matrix."""
    idx = TITLE_TO_IDX.get(title)
    if idx is None:
        return None
    cosine_sim_row = linear_kernel(TFIDF_MATRIX[idx], TFIDF_MATRIX).flatten()
    similar_idx = cosine_sim_row.argsort()[::-1]
    similar_idx = [i for i in similar_idx if i != idx][:top_n]
    scores = {i: float(cosine_sim_row[i]) for i in similar_idx}
    result = DF.iloc[similar_idx]
    out = []
    for _, r in result.iterrows():
        d = movie_to_dict(r)
        d["match_score"] = round(scores[int(r["movie_id"])] * 100, 1)
        out.append(d)
    return out


def recommend_with_explanation(liked_titles: list[str], top_n: int = 12):
    """'Recommended because you liked X and Y' — averages similarity across
    multiple seed titles picked from the user's favorites/watch history."""
    valid = [t for t in liked_titles if t in TITLE_TO_IDX]
    if not valid:
        return []
    idxs = [TITLE_TO_IDX[t] for t in valid]
    sims = linear_kernel(TFIDF_MATRIX[idxs], TFIDF_MATRIX)
    avg_sim = sims.mean(axis=0)
    ranked = avg_sim.argsort()[::-1]
    ranked = [i for i in ranked if i not in idxs][:top_n]
    result = DF.iloc[ranked]
    out = []
    for _, r in result.iterrows():
        d = movie_to_dict(r)
        d["explanation"] = f"Because you liked {', '.join(valid[:2])}"
        out.append(d)
    return out


def compare_movies(title_a: str, title_b: str):
    a = get_movie_by_title(title_a)
    b = get_movie_by_title(title_b)
    if not a or not b:
        return None
    score_a = a["vote_average"] * 0.7 + min(a["popularity"], 20) / 20 * 3
    score_b = b["vote_average"] * 0.7 + min(b["popularity"], 20) / 20 * 3
    winner = a if score_a >= score_b else b
    return {"a": a, "b": b, "winner": winner["title"],
            "reasoning": f"{winner['title']} edges it out on a blend of rating "
                         f"({winner['vote_average']}) and audience popularity."}


def friend_match(title_a: str, title_b: str, top_n: int = 10):
    """Movies both of two 'favorite' titles suggest in common (intersection of
    each title's own recommendation list, ranked by combined similarity)."""
    rec_a = recommend(title_a, top_n=200)
    rec_b = recommend(title_b, top_n=200)
    if rec_a is None or rec_b is None:
        return None
    scores_b = {r["title"]: r["match_score"] for r in rec_b}
    combined = []
    for r in rec_a:
        if r["title"] in scores_b:
            combined.append({**r, "match_score": round((r["match_score"] + scores_b[r["title"]]) / 2, 1)})
    combined.sort(key=lambda x: x["match_score"], reverse=True)
    return combined[:top_n]


def chatbot_recommend(message: str, top_n: int = 10):
    """Very lightweight rule-based NLP: pull out mood/genre keywords and an
    optional 'like <title>' reference movie, then route to the right helper.
    This is intentionally simple (keyword matching, not a real LLM) — it's
    honest about being a rules engine, not artificial general intelligence."""
    msg = message.lower()

    like_match = re.search(r"like ([a-z0-9:' \-]+)", msg)
    if like_match:
        candidate = like_match.group(1).strip().lower()
        candidate = re.split(r"\b(but|and|or)\b", candidate)[0].strip()  # trim trailing clauses
        match = None
        # 1) exact title match, 2) candidate is a whole-word match inside a longer title
        for known_title in TITLE_TO_IDX:
            if known_title.lower() == candidate:
                match = known_title
                break
        if not match and len(candidate) >= 4:
            for known_title in TITLE_TO_IDX:
                if re.search(rf"\b{re.escape(candidate)}\b", known_title.lower()):
                    match = known_title
                    break
        if match:
            recs = recommend(match, top_n=top_n)
            if recs:
                return {"basis": f"movies similar to {match}", "results": recs}

    mood_hits = [m for m in MOOD_TO_GENRES if m in msg]
    genre_hits = [g for g in CANONICAL_GENRES if g.lower() in msg]

    if mood_hits:
        return {"basis": f"your {mood_hits[0]} mood", "results": by_mood(mood_hits[0], limit=top_n)}
    if genre_hits:
        return {"basis": f"the {genre_hits[0]} genre", "results": search_by_genre(genre_hits[0], limit=top_n)}

    return {"basis": "trending picks", "results": trending(limit=top_n)}

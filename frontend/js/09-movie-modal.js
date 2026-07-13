/* ---------------------------- movie detail modal --------------------------- */
async function openMovieModal(id) {
  const modal = qs("#movie-modal");
  const content = qs("#movie-modal-content");
  content.innerHTML = `<div style="padding:80px;text-align:center;color:var(--text-faint);">Loading…</div>`;
  modal.classList.add("open");
  const [movie, recs, reviews] = await Promise.all([
    api(`/api/movie/${id}`),
    api(`/api/recommend/${id}?limit=10`),
    api(`/api/reviews/${id}`),
  ]);
  if (state.user)
    api("/api/history", {
      method: "POST",
      auth: true,
      body: { movie_id: id, movie_title: movie.title, progress_pct: 100 },
    }).catch(() => {});

  const backdropStyle = movie.backdrop_url
    ? `background-image:url('${movie.backdrop_url}')`
    : `background:linear-gradient(160deg,${gradFor(movie.genres)[0]},${gradFor(movie.genres)[1]})`;
  const isFav = state.favoriteIds.has(movie.id);

  content.innerHTML = `
    <div class="detail-backdrop" style="${backdropStyle}"></div>
    <div class="detail-body">
      <h2 class="detail-title">${escapeHtml(movie.title)}</h2>
      ${movie.tagline ? `<div class="detail-tagline">"${escapeHtml(movie.tagline)}"</div>` : ""}
      <div class="detail-meta">
        <span class="rating-pill">★ ${movie.vote_average}/10</span>
        ${movie.release_date ? `<span>${movie.release_date.slice(0, 4)}</span>` : ""}
        ${movie.runtime ? `<span>${movie.runtime} min</span>` : ""}
        ${movie.director ? `<span>Dir. ${escapeHtml(movie.director)}</span>` : ""}
      </div>
      <div class="detail-genres">${(movie.genres || []).map((g) => `<span class="chip">${g}</span>`).join("")}</div>
      <p class="detail-overview">${escapeHtml(movie.overview || "No synopsis available.")}</p>
      <div class="detail-actions">
        <button class="btn btn-primary" id="dm-fav">${isFav ? "❤ In Favorites" : "♡ Add to Favorites"}</button>
        <button class="btn btn-ghost" id="dm-watch"><i class="fa-solid fa-plus"></i> Watchlist</button>
        <button class="btn btn-ghost" id="dm-share"><i class="fa-solid fa-share"></i> Share</button>
      </div>

      ${
        movie.trailer_key
          ? `
      <div class="detail-section-title"><i class="fa-solid fa-play"></i> Trailer</div>
      <div class="trailer-embed"><iframe src="https://www.youtube.com/embed/${movie.trailer_key}" allowfullscreen></iframe></div>
      `
          : ""
      }

      ${
        movie.cast && movie.cast.length
          ? `
      <div class="detail-section-title"><i class="fa-solid fa-users"></i> Cast</div>
      <div class="cast-row">${movie.cast
        .map(
          (name) => `
        <div class="cast-chip"><div class="cast-avatar">${name
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")}</div><div class="cast-name">${escapeHtml(name)}</div></div>
      `,
        )
        .join("")}</div>`
          : ""
      }

      <div class="detail-section-title"><i class="fa-solid fa-star"></i> Rate this movie</div>
      <div class="stars-input" id="dm-stars">${[1, 2, 3, 4, 5].map((i) => `<span class="star" data-v="${i}">★</span>`).join("")}</div>

      <div class="detail-section-title"><i class="fa-solid fa-comment"></i> Reviews (${reviews.length})</div>
      <textarea class="review-input" id="dm-review-text" placeholder="Share your thoughts…"></textarea>
      <button class="btn btn-ghost btn-sm" id="dm-review-submit" style="margin-top:8px;">Post Review</button>
      <div id="dm-reviews">${
        reviews
          .map(
            (r) => `
        <div class="review-item">
          <div class="review-user">${escapeHtml(r.username)} <span class="review-date">${new Date(r.created_at).toLocaleDateString()}</span></div>
          <div class="review-body">${escapeHtml(r.body)}</div>
        </div>`,
          )
          .join("") ||
        '<div style="color:var(--text-faint);font-size:13px;padding:10px 0;">No reviews yet — be the first.</div>'
      }</div>

      <div class="detail-section-title"><i class="fa-solid fa-lightbulb"></i> Because you liked this</div>
      <div class="row-scroll" id="dm-similar" style="padding-left:0;padding-right:0;"></div>
    </div>`;

  const simRow = qs("#dm-similar");
  recs.forEach((m) => simRow.appendChild(movieCard(m)));

  qs("#dm-fav").onclick = async () => {
    await toggleFavorite(movie);
    openMovieModal(id);
  };
  qs("#dm-watch").onclick = () => addToWatchlist(movie);
  qs("#dm-share").onclick = () => {
    navigator.clipboard?.writeText(
      `${location.origin}${location.pathname}#/movie/${id}`,
    );
    toast("Link copied to clipboard");
  };
  qsa("#dm-stars .star").forEach(
    (star) =>
      (star.onclick = async () => {
        if (!state.user) return openAuth();
        const v = +star.dataset.v;
        qsa("#dm-stars .star").forEach((s) =>
          s.classList.toggle("active", +s.dataset.v <= v),
        );
        await api("/api/ratings", {
          method: "POST",
          auth: true,
          body: { movie_id: id, movie_title: movie.title, stars: v },
        });
        toast("Rating saved");
      }),
  );
  qs("#dm-review-submit").onclick = async () => {
    if (!state.user) return openAuth();
    const body = qs("#dm-review-text").value.trim();
    if (!body) return;
    await api("/api/reviews", {
      method: "POST",
      auth: true,
      body: { movie_id: id, movie_title: movie.title, body },
    });
    openMovieModal(id);
  };
}

/* ---------------------------- card rendering ------------------------------ */
function matchRingSVG(pct) {
  const r = 14,
    c = 2 * Math.PI * r;
  const offset = c - (c * pct) / 100;
  const color =
    pct > 75 ? "var(--green)" : pct > 45 ? "var(--gold)" : "var(--text-faint)";
  return `<svg viewBox="0 0 34 34" class="match-ring">
    <circle cx="17" cy="17" r="${r}" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
    <circle cx="17" cy="17" r="${r}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 17 17)"/>
    <text x="17" y="20" text-anchor="middle" font-size="9" fill="#fff" font-family="var(--font-mono)">${Math.round(pct)}</text>
  </svg>`;
}
function movieCard(movie) {
  const el = document.createElement("div");
  el.className = "card";
  const [ga, gb] = gradFor(movie.genres);
  el.style.setProperty("--grad-a", ga);
  el.style.setProperty("--grad-b", gb);
  const isFav = state.favoriteIds.has(movie.id);
  el.innerHTML = `
    <div class="card-poster">
      <img alt="${escapeHtml(movie.title)} poster">
      <div class="fallback-title">${escapeHtml(movie.title)}</div>
      ${movie.vote_average ? `<div class="card-badge">★ ${movie.vote_average}</div>` : ""}
      ${movie.match_score != null ? matchRingSVG(movie.match_score) : ""}
      <div class="card-quick">
        <button class="q-fav" title="Add to favorites">${isFav ? "❤" : "♡"}</button>
        <button class="q-watch" title="Add to watchlist"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(movie.title)}</div>
      <div class="card-genres">${(movie.genres || []).join(", ")}</div>
    </div>`;
  el.querySelector(".card-poster").addEventListener("click", () =>
    openMovieModal(movie.id),
  );
  el.querySelector(".card-body").addEventListener("click", () =>
    openMovieModal(movie.id),
  );
  el.querySelector(".q-fav").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(movie);
  });
  el.querySelector(".q-watch").addEventListener("click", (e) => {
    e.stopPropagation();
    addToWatchlist(movie);
  });
  observeCardPoster(el, movie);
  return el;
}
/* ---------------------------- row rendering ------------------------------ */
function renderRow(container, { title, sub, items, seeAllHref }) {
  // Clone the row template
  const tpl = qs("#tpl-row").content.cloneNode(true);

  // Render HTML (so Font Awesome icons work)
  tpl.querySelector(".section-title").innerHTML = title;

  // Subtitle
  tpl.querySelector(".section-sub").textContent = sub || "";

  // "See All" button
  const seeAll = tpl.querySelector(".see-all");
  if (seeAllHref) {
    seeAll.href = seeAllHref;
  } else {
    seeAll.remove();
  }

  // Add movie cards
  const row = tpl.querySelector(".row-scroll");
  items.forEach((movie) => {
    row.appendChild(movieCard(movie));
  });

  // Add the row to the page
  container.appendChild(tpl);
}
function renderGrid(container, items) {
  container.innerHTML = "";
  items.forEach((m) => container.appendChild(movieCard(m)));
}

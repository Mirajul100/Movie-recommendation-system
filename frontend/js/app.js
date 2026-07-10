/* ==========================================================================
   MovieFlix front-end
   Talks to the FastAPI backend mounted at the same origin (API_BASE = '').
   No build step — plain JS, works by opening index.html through the server.
   ========================================================================== */
const API = "";
const state = {
  token: localStorage.getItem("mf_token") || null,
  user: JSON.parse(localStorage.getItem("mf_user") || "null"),
  genres: [],
  favoriteIds: new Set(),
  watchlistIds: new Set(),
};

const GENRE_GRADIENTS = {
  Action: ["#7a1f1f", "#1a0a0a"],
  Adventure: ["#1f5a3d", "#0a1a12"],
  Animation: ["#1f4a7a", "#0a1626"],
  Comedy: ["#7a6a1f", "#1e1a08"],
  Crime: ["#3d3d3d", "#0f0f0f"],
  Documentary: ["#1f5a5a", "#0a1a1a"],
  Drama: ["#4a1f5a", "#150a1a"],
  Family: ["#1f7a5e", "#08201a"],
  Fantasy: ["#5a2f7a", "#180a22"],
  History: ["#6b4a1f", "#1e1408"],
  Horror: ["#3a0a0a", "#0d0303"],
  Music: ["#1f5a7a", "#0a1a22"],
  Mystery: ["#2a1f4a", "#0a0818"],
  Romance: ["#7a1f4a", "#22081a"],
  "Science Fiction": ["#1f3d7a", "#08122a"],
  "TV Movie": ["#4a4a1f", "#141408"],
  Thriller: ["#3d1f2c", "#160a10"],
  War: ["#4a2f1f", "#160f08"],
  Western: ["#5a4a1f", "#181408"],
  _default: ["#3a2b4d", "#1a1522"],
};
const MOOD_ICONS = {
  happy: "😄",
  sad: "😢",
  excited: "🤩",
  romantic: "💕",
  relaxing: "🌿",
  inspirational: "✨",
};
const MOOD_DESC = {
  happy: "Comedies & feel-good family fun",
  sad: "Dramas worth a good cry",
  excited: "Action, adventure & thrillers",
  romantic: "Love stories, front and center",
  relaxing: "Easy, low-stakes watching",
  inspirational: "Stories that light a fire in you",
};
const COLLECTIONS = [
  "Harry Potter",
  "Marvel",
  "Fast",
  "Mission: Impossible",
  "Batman",
  "Star Wars",
  "James Bond",
];

/* ---------------------------- helpers ---------------------------------- */
function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}
function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  qs("#toast-stack").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function gradFor(genres) {
  const g = (genres && genres[0]) || "_default";
  return GENRE_GRADIENTS[g] || GENRE_GRADIENTS._default;
}
async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers["Authorization"] = "Bearer " + state.token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    toast("Please log in for that.");
    openAuth();
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* ---------------------------- auth -------------------------------------- */
function renderAuthSlot() {
  const slot = qs("#auth-slot");
  if (!state.user) {
    slot.innerHTML = `<button class="btn btn-primary btn-sm" id="login-open-btn">Sign In</button>`;
    qs("#login-open-btn").onclick = openAuth;
  } else {
    const initial = state.user.username[0].toUpperCase();
    slot.innerHTML = `
      <div class="avatar-menu">
        <button class="avatar-btn" id="avatar-btn">${initial}</button>
        <div class="dropdown" id="avatar-dropdown">
          <div style="padding:8px 10px;font-size:12.5px;color:var(--text-faint);">Signed in as <b style="color:var(--text)">${escapeHtml(state.user.username)}</b></div>
          <hr>
          <a href="#/my-list">📋 My List</a>
          ${state.user.is_admin ? '<a href="#/admin">🛠 Admin Dashboard</a>' : ""}
          <hr>
          <button id="logout-btn">↩ Log Out</button>
        </div>
      </div>`;
    qs("#avatar-btn").onclick = () =>
      qs("#avatar-dropdown").classList.toggle("open");
    qs("#logout-btn").onclick = () => {
      logout();
    };
  }
}
function openAuth() {
  qs("#auth-modal").classList.add("open");
}
function closeAuth() {
  qs("#auth-modal").classList.remove("open");
  qs("#auth-error").textContent = "";
}
function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("mf_token");
  localStorage.removeItem("mf_user");
  renderAuthSlot();
  toast("Logged out");
  navigate("#/home");
}
async function loadMyLists() {
  if (!state.user) return;
  try {
    const favs = await api("/api/favorites", { auth: true });
    const wl = await api("/api/watchlist", { auth: true });
    state.favoriteIds = new Set(favs.map((f) => f.movie_id));
    state.watchlistIds = new Set(wl.map((w) => w.movie_id));
  } catch (e) {
    /* not logged in or empty */
  }
}

qs("#tab-login").onclick = () => {
  qs("#tab-login").classList.add("active");
  qs("#tab-signup").classList.remove("active");
  qs("#login-form").classList.remove("hide");
  qs("#signup-form").classList.add("hide");
};
qs("#tab-signup").onclick = () => {
  qs("#tab-signup").classList.add("active");
  qs("#tab-login").classList.remove("active");
  qs("#signup-form").classList.remove("hide");
  qs("#login-form").classList.add("hide");
};

qs("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: {
        username: qs("#login-username").value,
        password: qs("#login-password").value,
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    qs("#auth-error").textContent = "Incorrect username or password.";
  }
});
qs("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/auth/signup", {
      method: "POST",
      body: {
        username: qs("#signup-username").value,
        email: qs("#signup-email").value,
        password: qs("#signup-password").value,
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    qs("#auth-error").textContent =
      "Could not create account (username/email may be taken).";
  }
});
function onAuthSuccess(data) {
  state.token = data.access_token;
  state.user = data.user;
  localStorage.setItem("mf_token", state.token);
  localStorage.setItem("mf_user", JSON.stringify(state.user));
  renderAuthSlot();
  closeAuth();
  toast(`Welcome, ${state.user.username}!`);
  loadMyLists();
}

/* ---------------------------- nav / topnav shadow ------------------------ */
window.addEventListener("scroll", () => {
  qs("#topnav").classList.toggle("scrolled", window.scrollY > 30);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".avatar-menu"))
    qsa(".dropdown").forEach((d) => d.classList.remove("open"));
});
qsa("[data-close]").forEach((btn) =>
  btn.addEventListener("click", () => {
    qs("#" + btn.dataset.close).classList.remove("open");
  }),
);
qsa(".overlay").forEach((ov) =>
  ov.addEventListener("click", (e) => {
    if (e.target === ov) ov.classList.remove("open");
  }),
);

/* ---------------------------- theme -------------------------------------- */
qs("#theme-toggle").onclick = () => {
  document.body.classList.toggle("light");
  qs("#theme-toggle").textContent = document.body.classList.contains("light")
    ? "☀"
    : "☾";
  localStorage.setItem(
    "mf_theme",
    document.body.classList.contains("light") ? "light" : "dark",
  );
};
if (localStorage.getItem("mf_theme") === "light") {
  document.body.classList.add("light");
  qs("#theme-toggle").textContent = "☀";
}

/* ---------------------------- lazy poster enrichment --------------------- */
const enrichCache = new Map();
async function enrichTitles(titles) {
  const need = titles.filter((t) => !enrichCache.has(t));
  if (need.length) {
    try {
      const data = await api(
        "/api/enrich?titles=" + encodeURIComponent(need.join("|")),
      );
      Object.entries(data).forEach(([t, v]) => enrichCache.set(t, v));
    } catch (e) {
      need.forEach((t) => enrichCache.set(t, {}));
    }
  }
  return Object.fromEntries(titles.map((t) => [t, enrichCache.get(t) || {}]));
}
function observeCardPoster(cardEl, movie) {
  const io = new IntersectionObserver(
    async (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          io.disconnect();
          const enriched = (await enrichTitles([movie.title]))[movie.title];
          if (enriched && enriched.poster_url) {
            const img = cardEl.querySelector("img");
            img.src = enriched.poster_url;
            img.onload = () => img.classList.add("loaded");
          }
        }
      }
    },
    { rootMargin: "200px" },
  );
  io.observe(cardEl);
}

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
        <button class="q-watch" title="Add to watchlist">＋</button>
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
function renderRow(container, { title, sub, items, seeAllHref }) {
  const tpl = qs("#tpl-row").content.cloneNode(true);
  tpl.querySelector(".section-title").textContent = title;
  tpl.querySelector(".section-sub").textContent = sub || "";
  const seeAll = tpl.querySelector(".see-all");
  if (seeAllHref) seeAll.href = seeAllHref;
  else seeAll.remove();
  const row = tpl.querySelector(".row-scroll");
  items.forEach((m) => row.appendChild(movieCard(m)));
  container.appendChild(tpl);
}
function renderGrid(container, items) {
  container.innerHTML = "";
  items.forEach((m) => container.appendChild(movieCard(m)));
}

/* ---------------------------- favorites / watchlist ----------------------- */
async function toggleFavorite(movie) {
  if (!state.user) return openAuth();
  if (state.favoriteIds.has(movie.id)) {
    await api(`/api/favorites/${movie.id}`, { method: "DELETE", auth: true });
    state.favoriteIds.delete(movie.id);
    toast("Removed from favorites");
  } else {
    await api("/api/favorites", {
      method: "POST",
      auth: true,
      body: { movie_id: movie.id, movie_title: movie.title },
    });
    state.favoriteIds.add(movie.id);
    toast("Added to favorites ❤");
  }
}
async function addToWatchlist(movie) {
  if (!state.user) return openAuth();
  await api("/api/watchlist", {
    method: "POST",
    auth: true,
    body: { movie_id: movie.id, movie_title: movie.title },
  });
  state.watchlistIds.add(movie.id);
  toast("Added to watchlist");
}

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
        <button class="btn btn-ghost" id="dm-watch">＋ Watchlist</button>
        <button class="btn btn-ghost" id="dm-share">↗ Share</button>
      </div>

      ${
        movie.trailer_key
          ? `
      <div class="detail-section-title">▶ Trailer</div>
      <div class="trailer-embed"><iframe src="https://www.youtube.com/embed/${movie.trailer_key}" allowfullscreen></iframe></div>
      `
          : ""
      }

      ${
        movie.cast && movie.cast.length
          ? `
      <div class="detail-section-title">🎭 Cast</div>
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

      <div class="detail-section-title">⭐ Rate this movie</div>
      <div class="stars-input" id="dm-stars">${[1, 2, 3, 4, 5].map((i) => `<span class="star" data-v="${i}">★</span>`).join("")}</div>

      <div class="detail-section-title">💬 Reviews (${reviews.length})</div>
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

      <div class="detail-section-title">✦ Because you liked this</div>
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

/* ---------------------------- hero ----------------------------------------- */
async function loadHero() {
  const movie = await api("/api/trending?limit=1").then((r) => r[0]);
  const enriched = (await enrichTitles([movie.title]))[movie.title];
  Object.assign(movie, enriched);
  if (movie.backdrop_url)
    qs("#hero-bg").style.backgroundImage = `url('${movie.backdrop_url}')`;
  else
    qs("#hero-bg").style.background =
      `linear-gradient(160deg,${gradFor(movie.genres)[0]},${gradFor(movie.genres)[1]})`;
  qs("#hero-title").textContent = movie.title;
  qs("#hero-overview").textContent = movie.overview || movie.tagline || "";
  qs("#hero-meta").innerHTML = `
    <span class="rating-pill">★ ${movie.vote_average}</span>
    ${movie.release_date ? `<span>${movie.release_date.slice(0, 4)}</span>` : ""}
    <span>${(movie.genres || []).join(" · ")}</span>`;
  qs("#hero-more-info").onclick = () => openMovieModal(movie.id);
  qs("#hero-watchlist").onclick = () => addToWatchlist(movie);
  qs("#hero-similar").onclick = async () => {
    const recs = await api(`/api/recommend/${movie.id}?limit=12`);
    renderExplainRow(recs, `Because it's trending: ${movie.title}`);
  };
}
function renderExplainRow(items, basis) {
  const container = qs("#rows-container");
  const holder = document.createElement("div");
  renderRow(holder, { title: "✦ AI Picks For You", sub: basis, items });
  container.prepend(holder.firstElementChild);
  holder.firstElementChild?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/* ---------------------------- home rows ------------------------------------ */
async function loadHomeRows() {
  const container = qs("#rows-container");
  container.innerHTML = "";
  const sections = [
    {
      key: "trending",
      title: "🔥 Trending Now",
      sub: "What everyone is watching",
      href: "#/browse?sort=popularity",
    },
    {
      key: "top-rated",
      title: "⭐ Top Rated",
      sub: "Highest audience scores",
      href: "#/browse?sort=rating",
    },
    {
      key: "popular",
      title: "📈 Popular This Week",
      sub: "A blend of buzz and quality",
    },
    {
      key: "hidden-gems",
      title: "💎 Hidden Gems",
      sub: "Great movies, under the radar",
    },
    {
      key: "award-winners",
      title: "🏆 Acclaimed & Award-Worthy",
      sub: "Critically loved",
    },
    {
      key: "family-friendly",
      title: "👪 Family Friendly",
      sub: "Safe for movie night with the kids",
    },
  ];
  for (const s of sections) {
    try {
      const items = await api(`/api/${s.key}?limit=18`);
      renderRow(container, {
        title: s.title,
        sub: s.sub,
        items,
        seeAllHref: s.href,
      });
    } catch (e) {
      console.error(s.key, e);
    }
  }
}
async function loadPersonalRows() {
  if (!state.user) return;
  try {
    const cw = await api("/api/history/continue-watching", { auth: true });
    if (cw.length) {
      const items = cw.map((h) => ({
        id: h.movie_id,
        title: h.movie_title,
        genres: [],
        vote_average: null,
      }));
      const holder = qs("#continue-watching-section");
      holder.classList.remove("hide");
      renderRow(holder, {
        title: "▶ Continue Watching",
        sub: "Pick up where you left off",
        items,
      });
    }
  } catch (e) {}
  try {
    const rec = await api("/api/recommended-for-you", { auth: true });
    const holder = qs("#recommended-for-you-section");
    holder.classList.remove("hide");
    renderRow(holder, {
      title: "🎯 Recommended For You",
      sub: rec.basis,
      items: rec.results,
    });
  } catch (e) {}
}

/* ---------------------------- genre / mood / time tiles ---------------------- */
async function loadGenreTiles() {
  state.genres = await api("/api/genres");
  const html = () =>
    state.genres
      .map(
        (g) => `
    <a class="tile" href="#/browse?genre=${encodeURIComponent(g)}" style="background:linear-gradient(160deg,${GENRE_GRADIENTS[g]?.[0] || "#333"},${GENRE_GRADIENTS[g]?.[1] || "#111"})">
      <div class="tile-name">${g}</div><div class="tile-sub">Explore →</div>
    </a>`,
      )
      .join("");
  qs("#genre-tiles").innerHTML = html();
  qs("#genres-index-tiles").innerHTML = html();
  const genreSelect = qs("#f-genre");
  state.genres.forEach((g) =>
    genreSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${g}">${g}</option>`,
    ),
  );
}
function loadMoodTiles() {
  const html = Object.entries(MOOD_ICONS)
    .map(
      ([m, icon]) => `
    <a class="tile" href="#/browse?mood=${m}" style="background:linear-gradient(160deg,#2a2438,#141018);">
      <div class="tile-emoji">${icon}</div><div class="tile-name" style="text-transform:capitalize">${m}</div>
      <div class="tile-sub">${MOOD_DESC[m]}</div>
    </a>`,
    )
    .join("");
  qs("#mood-tiles").innerHTML = html;
  qs("#moods-index-tiles").innerHTML = html;
}
function loadTimeTiles() {
  qs("#time-tiles").innerHTML = `
    <a class="tile" href="#/browse?time=short" style="background:linear-gradient(160deg,#1f3d3d,#0a1a1a);">
      <div class="tile-emoji">⏱</div><div class="tile-name">Under 90 Min</div><div class="tile-sub">Quick watches</div>
    </a>
    <a class="tile" href="#/browse?time=weekend" style="background:linear-gradient(160deg,#3d2f1f,#1a1108);">
      <div class="tile-emoji">🛋️</div><div class="tile-name">Weekend Movies</div><div class="tile-sub">Popular crowd-pleasers</div>
    </a>
    <a class="tile" href="#/browse?time=long" style="background:linear-gradient(160deg,#2f1f3d,#11081a);">
      <div class="tile-emoji">🎬</div><div class="tile-name">Long Epics</div><div class="tile-sub">Settle in for the night</div>
    </a>`;
}
function loadCollectionsTiles() {
  qs("#collections-tiles").innerHTML = COLLECTIONS.map(
    (c) => `
    <a class="tile" href="#/browse?q=${encodeURIComponent(c)}" style="background:linear-gradient(160deg,#22283d,#0d0f18);">
      <div class="tile-name">${c}</div><div class="tile-sub">View saga →</div>
    </a>`,
  ).join("");
}

/* ---------------------------- browse / filter view ---------------------------- */
let browseState = {
  offset: 0,
  limit: 24,
  genre: "",
  mood: "",
  q: "",
  sort: "popularity",
  rating: 0,
  time: "",
};
async function fetchBrowsePage() {
  let items = [];
  if (browseState.q) {
    items = await api(
      `/api/search?q=${encodeURIComponent(browseState.q)}&limit=40`,
    );
  } else if (browseState.mood) {
    items = await api(
      `/api/mood/${browseState.mood}?limit=${browseState.limit}&offset=${browseState.offset}`,
    );
  } else if (browseState.genre) {
    items = await api(
      `/api/genre/${encodeURIComponent(browseState.genre)}?limit=${browseState.limit}&offset=${browseState.offset}`,
    );
  } else if (browseState.time) {
    items = await timeBasedBrowse(browseState.time);
  } else {
    const endpoint = browseState.sort === "rating" ? "top-rated" : "trending";
    items = await api(
      `/api/${endpoint}?limit=${browseState.limit}&offset=${browseState.offset}`,
    );
  }
  if (browseState.rating)
    items = items.filter((m) => m.vote_average >= browseState.rating);
  if (browseState.sort === "alpha")
    items = [...items].sort((a, b) => a.title.localeCompare(b.title));
  if (browseState.sort === "rating" && browseState.genre)
    items = [...items].sort((a, b) => b.vote_average - a.vote_average);
  return items;
}
async function timeBasedBrowse(kind) {
  // Best-effort: local dataset has no runtime, so we enrich a popular candidate
  // pool from TMDB and filter client-side. This intentionally covers a
  // curated pool rather than the full 45k catalog (see README "Known limits").
  const pool = await api(
    `/api/${kind === "weekend" ? "popular" : "trending"}?limit=40`,
  );
  const enriched = await enrichTitles(pool.map((m) => m.title));
  const withRuntime = pool.map((m) => ({
    ...m,
    runtime: enriched[m.title]?.runtime,
  }));
  if (kind === "short")
    return withRuntime.filter((m) => m.runtime && m.runtime <= 90);
  if (kind === "long")
    return withRuntime.filter((m) => m.runtime && m.runtime >= 140);
  return withRuntime; // 'weekend' — popularity already favors crowd-pleasers
}
async function renderBrowse(reset = true) {
  if (reset) {
    browseState.offset = 0;
    qs("#browse-grid").innerHTML = "";
  }
  const items = await fetchBrowsePage();
  if (reset) renderGrid(qs("#browse-grid"), items);
  else items.forEach((m) => qs("#browse-grid").appendChild(movieCard(m)));
  browseState.offset += browseState.limit;
  let label = "All Movies";
  if (browseState.genre) label = browseState.genre + " Movies";
  if (browseState.mood)
    label =
      MOOD_ICONS[browseState.mood] +
      " " +
      browseState.mood[0].toUpperCase() +
      browseState.mood.slice(1) +
      " Mood";
  if (browseState.q) label = `Results for "${browseState.q}"`;
  if (browseState.time)
    label = {
      short: "Under 90 Minutes",
      weekend: "Weekend Movies",
      long: "Long Epics",
    }[browseState.time];
  qs("#browse-title").textContent = label;
  qs("#browse-sub").textContent = `${items.length}+ titles`;
}
qs("#browse-load-more").onclick = () => renderBrowse(false);
qs("#f-genre").addEventListener("change", (e) => {
  browseState.genre = e.target.value;
  browseState.mood = "";
  browseState.q = "";
  browseState.time = "";
  renderBrowse();
});
qs("#f-sort").addEventListener("change", (e) => {
  browseState.sort = e.target.value;
  renderBrowse();
});
qs("#f-rating").addEventListener("change", (e) => {
  browseState.rating = +e.target.value;
  renderBrowse();
});

/* ---------------------------- search + suggestions ---------------------------- */
let searchDebounce;
qs("#search-input").addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  if (!q) {
    qs("#search-suggest").classList.remove("open");
    return;
  }
  searchDebounce = setTimeout(async () => {
    const results = await api(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
    const box = qs("#search-suggest");
    box.innerHTML =
      results
        .map(
          (m) => `
      <div class="suggest-row" data-id="${m.id}" data-title="${escapeHtml(m.title)}">
        <div class="suggest-thumb"></div>
        <div class="suggest-meta">
          <div class="suggest-title">${escapeHtml(m.title)}</div>
          <div class="suggest-sub">★ ${m.vote_average} · ${(m.genres || []).slice(0, 2).join(", ")}</div>
        </div>
      </div>`,
        )
        .join("") ||
      `<div style="padding:14px;color:var(--text-faint);font-size:13px;">No matches</div>`;
    box.classList.toggle("open", true);
    qsa(".suggest-row", box).forEach((row) =>
      row.addEventListener("click", () => {
        box.classList.remove("open");
        qs("#search-input").value = "";
        openMovieModal(+row.dataset.id);
      }),
    );
  }, 220);
});
qs("#search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    qs("#search-suggest").classList.remove("open");
    navigate("#/browse?q=" + encodeURIComponent(e.target.value.trim()));
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap"))
    qs("#search-suggest").classList.remove("open");
});

/* ---------------------------- surprise / random ---------------------------- */
async function surpriseMe() {
  const m = await api("/api/random");
  openMovieModal(m.id);
}
qs("#surprise-btn").onclick = surpriseMe;
qs("#tool-surprise2").onclick = surpriseMe;
qs("#tool-daily").onclick = async () => {
  const m = await api("/api/daily-pick");
  openMovieModal(m.id);
};

/* ---------------------------- compare / friend match ---------------------------- */
let compareMode = "compare";
function openCompare(mode) {
  compareMode = mode;
  qs("#compare-heading").textContent =
    mode === "compare" ? "⚔️ Movie Match" : "🤝 Friend Match";
  qs("#compare-a").placeholder =
    mode === "compare" ? "First movie title…" : "Your favorite movie…";
  qs("#compare-b").placeholder =
    mode === "compare" ? "Second movie title…" : "Friend's favorite movie…";
  qs("#compare-result").innerHTML = "";
  qs("#compare-modal").classList.add("open");
}
qs("#tool-compare").onclick = () => openCompare("compare");
qs("#tool-friend").onclick = () => openCompare("friend");
qs("#compare-submit").onclick = async () => {
  const a = qs("#compare-a").value.trim(),
    b = qs("#compare-b").value.trim();
  if (!a || !b) return;
  const resultBox = qs("#compare-result");
  resultBox.innerHTML = `<div style="color:var(--text-faint);">Thinking…</div>`;
  try {
    if (compareMode === "compare") {
      const r = await api("/api/compare", {
        method: "POST",
        body: { title_a: a, title_b: b },
      });
      resultBox.innerHTML = `
        <div class="vs-wrap">
          <div class="vs-card"><b>${escapeHtml(r.a.title)}</b><div>★ ${r.a.vote_average} · pop ${r.a.popularity}</div></div>
          <div class="vs-versus">VS</div>
          <div class="vs-card"><b>${escapeHtml(r.b.title)}</b><div>★ ${r.b.vote_average} · pop ${r.b.popularity}</div></div>
        </div>
        <div class="vs-winner">🏆 <b>${escapeHtml(r.winner)}</b> wins — ${escapeHtml(r.reasoning)}</div>`;
    } else {
      const r = await api("/api/friend-match", {
        method: "POST",
        body: { title_a: a, title_b: b },
      });
      if (!r.length) {
        resultBox.innerHTML = `<div style="color:var(--text-faint);">No strong overlap found — try two different titles.</div>`;
        return;
      }
      resultBox.innerHTML = `<div style="margin-bottom:10px;color:var(--text-dim);font-size:13.5px;">You'll both probably enjoy:</div><div class="row-scroll" style="padding:0;" id="friend-results"></div>`;
      r.forEach((m) => qs("#friend-results").appendChild(movieCard(m)));
    }
  } catch (e) {
    resultBox.innerHTML = `<div style="color:#ff6b6b;">Couldn't find one or both titles — check spelling.</div>`;
  }
};

/* ---------------------------- chatbot ---------------------------- */
qs("#chat-fab").onclick = () => qs("#chat-panel").classList.toggle("open");
function addChatMsg(text, who) {
  const el = document.createElement("div");
  el.className = `chat-msg ${who}`;
  el.textContent = text;
  qs("#chat-body").appendChild(el);
  qs("#chat-body").scrollTop = 1e9;
}
async function sendChat() {
  const input = qs("#chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  addChatMsg(msg, "user");
  input.value = "";
  try {
    const r = await api("/api/chatbot", {
      method: "POST",
      body: { message: msg },
    });
    addChatMsg(`Based on ${r.basis}, here's what I found:`, "bot");
    const wrap = document.createElement("div");
    wrap.className = "chat-results";
    r.results.slice(0, 8).forEach((m) => {
      const c = document.createElement("div");
      c.className = "chat-mini-card";
      c.innerHTML = `<div class="chat-mini-poster"></div>${escapeHtml(m.title)}`;
      c.onclick = () => openMovieModal(m.id);
      wrap.appendChild(c);
    });
    qs("#chat-body").appendChild(wrap);
    qs("#chat-body").scrollTop = 1e9;
  } catch (e) {
    addChatMsg("Hmm, I couldn't reach the recommendation engine.", "bot");
  }
}
qs("#chat-send").onclick = sendChat;
qs("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

/* ---------------------------- my list view ---------------------------- */
async function renderMyList() {
  if (!state.user) {
    openAuth();
    return;
  }
  const [favs, wl] = await Promise.all([
    api("/api/favorites", { auth: true }),
    api("/api/watchlist", { auth: true }),
  ]);
  const toMovies = async (list) =>
    Promise.all(
      list.map((x) =>
        api(`/api/movie/${x.movie_id}`).catch(() => ({
          id: x.movie_id,
          title: x.movie_title,
          genres: [],
        })),
      ),
    );
  renderGrid(qs("#mylist-favorites"), await toMovies(favs));
  renderGrid(qs("#mylist-watchlist"), await toMovies(wl));
}

/* ---------------------------- admin view ---------------------------- */
async function renderAdmin() {
  const el = qs("#admin-view");
  if (!state.user || !state.user.is_admin) {
    el.innerHTML = `<p style="color:var(--text-faint);">Admin access required.</p>`;
    return;
  }
  const [stats, searches, users] = await Promise.all([
    api("/api/admin/stats", { auth: true }),
    api("/api/admin/top-searches?limit=10", { auth: true }),
    api("/api/admin/users", { auth: true }),
  ]);
  el.innerHTML = `
    <div class="section-title" style="margin-bottom:20px;">🛠 Admin Dashboard</div>
    <div class="admin-stats">
      ${Object.entries(stats)
        .map(
          ([k, v]) =>
            `<div class="stat-card"><div class="stat-num">${v}</div><div class="stat-label">${k.replace(/_/g, " ")}</div></div>`,
        )
        .join("")}
    </div>
    <div class="detail-section-title">🔎 Popular Searches</div>
    <table class="admin-table"><thead><tr><th>Query</th><th>Count</th></tr></thead>
      <tbody>${searches.map((s) => `<tr><td>${escapeHtml(s.query)}</td><td>${s.count}</td></tr>`).join("") || "<tr><td colspan=2>No searches logged yet</td></tr>"}</tbody></table>
    <div class="detail-section-title">👤 Users</div>
    <table class="admin-table"><thead><tr><th>Username</th><th>Email</th><th>Joined</th><th>Admin</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${u.is_admin ? "✔" : ""}</td></tr>`).join("")}</tbody></table>`;
}

/* ---------------------------- router ---------------------------- */
const VIEWS = [
  "home",
  "browse",
  "genres",
  "moods",
  "collections",
  "mylist",
  "admin",
];
function showView(name) {
  VIEWS.forEach((v) => qs(`#view-${v}`)?.classList.toggle("hide", v !== name));
  qsa(".nav-links a").forEach((a) =>
    a.classList.toggle("active", a.dataset.nav === name),
  );
}
async function router() {
  const hash = location.hash || "#/home";
  const [path, queryStr] = hash.slice(1).split("?");
  const params = new URLSearchParams(queryStr || "");
  qs("#search-suggest").classList.remove("open");

  if (path === "/home" || path === "/") {
    showView("home");
  } else if (path === "/browse") {
    showView("browse");
    browseState = {
      offset: 0,
      limit: 24,
      genre: params.get("genre") || "",
      mood: params.get("mood") || "",
      q: params.get("q") || "",
      sort: params.get("sort") || "popularity",
      rating: 0,
      time: params.get("time") || "",
    };
    qs("#f-genre").value = browseState.genre;
    qs("#f-sort").value = browseState.sort;
    renderBrowse();
  } else if (path === "/genres") {
    showView("genres");
  } else if (path === "/moods") {
    showView("moods");
  } else if (path === "/collections") {
    showView("collections");
  } else if (path === "/my-list") {
    showView("mylist");
    renderMyList();
  } else if (path === "/admin") {
    showView("admin");
    renderAdmin();
  } else if (path.startsWith("/movie/")) {
    showView("home");
    openMovieModal(+path.split("/")[2]);
  } else {
    showView("home");
  }
}
function navigate(hash) {
  location.hash = hash;
}
window.addEventListener("hashchange", router);
qs("#foot-admin").addEventListener("click", (e) => {
  e.preventDefault();
  navigate("#/admin");
});

/* ---------------------------- init ---------------------------- */
(async function init() {
  renderAuthSlot();
  await loadMyLists();
  loadGenreTiles();
  loadMoodTiles();
  loadTimeTiles();
  loadCollectionsTiles();
  loadHero();
  loadHomeRows().then(loadPersonalRows);
  router();
})();

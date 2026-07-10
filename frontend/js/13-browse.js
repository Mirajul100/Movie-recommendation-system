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

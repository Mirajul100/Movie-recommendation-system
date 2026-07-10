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

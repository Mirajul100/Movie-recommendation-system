/* ---------------------------- hero ----------------------------------------- */
async function loadHero() {
  const movie = await api("/api/new-releases?limit=1").then((r) => r[0]);
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

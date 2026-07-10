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

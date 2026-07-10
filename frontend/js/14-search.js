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

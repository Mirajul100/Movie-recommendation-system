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

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

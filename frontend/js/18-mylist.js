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

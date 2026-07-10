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

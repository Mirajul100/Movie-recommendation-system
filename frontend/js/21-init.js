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

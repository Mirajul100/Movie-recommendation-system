/* ---------------------------- router ---------------------------- */
const VIEWS = [
  "home",
  "browse",
  "genres",
  "moods",
  "collections",
  "mylist",
  "admin",
];
function showView(name) {
  VIEWS.forEach((v) => qs(`#view-${v}`)?.classList.toggle("hide", v !== name));
  qsa(".nav-links a").forEach((a) =>
    a.classList.toggle("active", a.dataset.nav === name),
  );
}
async function router() {
  const hash = location.hash || "#/home";
  const [path, queryStr] = hash.slice(1).split("?");
  const params = new URLSearchParams(queryStr || "");
  qs("#search-suggest").classList.remove("open");

  if (path === "/home" || path === "/") {
    showView("home");
  } else if (path === "/browse") {
    showView("browse");
    browseState = {
      offset: 0,
      limit: 24,
      genre: params.get("genre") || "",
      mood: params.get("mood") || "",
      q: params.get("q") || "",
      sort: params.get("sort") || "popularity",
      rating: 0,
      time: params.get("time") || "",
    };
    qs("#f-genre").value = browseState.genre;
    qs("#f-sort").value = browseState.sort;
    renderBrowse();
  } else if (path === "/genres") {
    showView("genres");
  } else if (path === "/moods") {
    showView("moods");
  } else if (path === "/collections") {
    showView("collections");
  } else if (path === "/my-list") {
    showView("mylist");
    renderMyList();
  } else if (path === "/admin") {
    showView("admin");
    renderAdmin();
  } else if (path.startsWith("/movie/")) {
    showView("home");
    openMovieModal(+path.split("/")[2]);
  } else {
    showView("home");
  }
}
function navigate(hash) {
  location.hash = hash;
}
window.addEventListener("hashchange", router);
qs("#foot-admin").addEventListener("click", (e) => {
  e.preventDefault();
  navigate("#/admin");
});

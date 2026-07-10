/* ---------------------------- theme -------------------------------------- */
qs("#theme-toggle").onclick = () => {
  document.body.classList.toggle("light");
  qs("#theme-toggle").textContent = document.body.classList.contains("light")
    ? "☀"
    : "☾";
  localStorage.setItem(
    "mf_theme",
    document.body.classList.contains("light") ? "light" : "dark",
  );
};
if (localStorage.getItem("mf_theme") === "light") {
  document.body.classList.add("light");
  qs("#theme-toggle").textContent = "☀";
}

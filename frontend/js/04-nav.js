/* ---------------------------- nav / topnav shadow ------------------------ */
window.addEventListener("scroll", () => {
  qs("#topnav").classList.toggle("scrolled", window.scrollY > 30);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".avatar-menu"))
    qsa(".dropdown").forEach((d) => d.classList.remove("open"));
});
qsa("[data-close]").forEach((btn) =>
  btn.addEventListener("click", () => {
    qs("#" + btn.dataset.close).classList.remove("open");
  }),
);
qsa(".overlay").forEach((ov) =>
  ov.addEventListener("click", (e) => {
    if (e.target === ov) ov.classList.remove("open");
  }),
);

/* ---------------------------- home rows ------------------------------------ */
async function loadHomeRows() {
  const container = qs("#rows-container");
  container.innerHTML = "";

  const sections = [
    {
      key: "trending",
      title: '<i class="fa-solid fa-fire"></i> Trending Now',
      sub: "What everyone is watching",
      href: "#/browse?sort=popularity",
    },
    {
      key: "top-rated",
      title: '<i class="fa-solid fa-star"></i> Top Rated',
      sub: "Highest audience scores",
      href: "#/browse?sort=rating",
    },
    {
      key: "popular",
      title: '<i class="fa-solid fa-chart-line"></i> Popular This Week',
      sub: "A blend of buzz and quality",
    },
    {
      key: "hidden-gems",
      title: '<i class="fa-solid fa-gem"></i> Hidden Gems',
      sub: "Great movies, under the radar",
    },
    {
      key: "award-winners",
      title: '<i class="fa-solid fa-trophy"></i> Acclaimed & Award-Worthy',
      sub: "Critically loved",
    },
    {
      key: "family-friendly",
      title: '<i class="fa-solid fa-children"></i> Family Friendly',
      sub: "Safe for movie night with the kids",
    },
  ];

  for (const s of sections) {
    try {
      const items = await api(`/api/${s.key}?limit=18`);

      renderRow(container, {
        title: s.title,
        sub: s.sub,
        items,
        seeAllHref: s.href,
      });
    } catch (e) {
      console.error(s.key, e);
    }
  }
}

/* ------------------------ personal rows ------------------------------------ */

async function loadPersonalRows() {
  if (!state.user) return;

  try {
    const cw = await api("/api/history/continue-watching", {
      auth: true,
    });

    if (cw.length) {
      const items = cw.map((h) => ({
        id: h.movie_id,
        title: h.movie_title,
        genres: [],
        vote_average: null,
      }));

      const holder = qs("#continue-watching-section");
      holder.classList.remove("hide");

      renderRow(holder, {
        title: '<i class="fa-solid fa-play"></i> Continue Watching',
        sub: "Pick up where you left off",
        items,
      });
    }
  } catch (e) {
    console.error(e);
  }

  try {
    const rec = await api("/api/recommended-for-you", {
      auth: true,
    });

    const holder = qs("#recommended-for-you-section");
    holder.classList.remove("hide");

    renderRow(holder, {
      title: '<i class="fa-solid fa-wand-magic-sparkles"></i> Recommended For You',
      sub: rec.basis,
      items: rec.results,
    });
  } catch (e) {
    console.error(e);
  }
}
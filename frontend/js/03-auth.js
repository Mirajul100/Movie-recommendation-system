/* ---------------------------- auth -------------------------------------- */
function renderAuthSlot() {
  const slot = qs("#auth-slot");
  if (!state.user) {
    slot.innerHTML = `<button class="btn btn-primary btn-sm" id="login-open-btn">Sign In</button>`;
    qs("#login-open-btn").onclick = openAuth;
  } else {
    const initial = state.user.username[0].toUpperCase();
    slot.innerHTML = `
      <div class="avatar-menu">
        <button class="avatar-btn" id="avatar-btn">${initial}</button>
        <div class="dropdown" id="avatar-dropdown">
          <div style="padding:8px 10px;font-size:12.5px;color:var(--text-faint);">Signed in as <b style="color:var(--text)">${escapeHtml(state.user.username)}</b></div>
          <hr>
          <a href="#/my-list">📋 My List</a>
          ${state.user.is_admin ? '<a href="#/admin">🛠 Admin Dashboard</a>' : ""}
          <hr>
          <button id="logout-btn">↩ Log Out</button>
        </div>
      </div>`;
    qs("#avatar-btn").onclick = () =>
      qs("#avatar-dropdown").classList.toggle("open");
    qs("#logout-btn").onclick = () => {
      logout();
    };
  }
}
function openAuth() {
  qs("#auth-modal").classList.add("open");
}
function closeAuth() {
  qs("#auth-modal").classList.remove("open");
  qs("#auth-error").textContent = "";
}
function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("mf_token");
  localStorage.removeItem("mf_user");
  renderAuthSlot();
  toast("Logged out");
  navigate("#/home");
}
async function loadMyLists() {
  if (!state.user) return;
  try {
    const favs = await api("/api/favorites", { auth: true });
    const wl = await api("/api/watchlist", { auth: true });
    state.favoriteIds = new Set(favs.map((f) => f.movie_id));
    state.watchlistIds = new Set(wl.map((w) => w.movie_id));
  } catch (e) {
    /* not logged in or empty */
  }
}

qs("#tab-login").onclick = () => {
  qs("#tab-login").classList.add("active");
  qs("#tab-signup").classList.remove("active");
  qs("#login-form").classList.remove("hide");
  qs("#signup-form").classList.add("hide");
};
qs("#tab-signup").onclick = () => {
  qs("#tab-signup").classList.add("active");
  qs("#tab-login").classList.remove("active");
  qs("#signup-form").classList.remove("hide");
  qs("#login-form").classList.add("hide");
};

qs("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: {
        username: qs("#login-username").value,
        password: qs("#login-password").value,
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    qs("#auth-error").textContent = "Incorrect username or password.";
  }
});
qs("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/auth/signup", {
      method: "POST",
      body: {
        username: qs("#signup-username").value,
        email: qs("#signup-email").value,
        password: qs("#signup-password").value,
      },
    });
    onAuthSuccess(data);
  } catch (err) {
    qs("#auth-error").textContent =
      "Could not create account (username/email may be taken).";
  }
});
function onAuthSuccess(data) {
  state.token = data.access_token;
  state.user = data.user;
  localStorage.setItem("mf_token", state.token);
  localStorage.setItem("mf_user", JSON.stringify(state.user));
  renderAuthSlot();
  closeAuth();
  toast(`Welcome, ${state.user.username}!`);
  loadMyLists();
}

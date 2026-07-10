/* ---------------------------- admin view ---------------------------- */
async function renderAdmin() {
  const el = qs("#admin-view");
  if (!state.user || !state.user.is_admin) {
    el.innerHTML = `<p style="color:var(--text-faint);">Admin access required.</p>`;
    return;
  }
  const [stats, searches, users] = await Promise.all([
    api("/api/admin/stats", { auth: true }),
    api("/api/admin/top-searches?limit=10", { auth: true }),
    api("/api/admin/users", { auth: true }),
  ]);
  el.innerHTML = `
    <div class="section-title" style="margin-bottom:20px;">🛠 Admin Dashboard</div>
    <div class="admin-stats">
      ${Object.entries(stats)
        .map(
          ([k, v]) =>
            `<div class="stat-card"><div class="stat-num">${v}</div><div class="stat-label">${k.replace(/_/g, " ")}</div></div>`,
        )
        .join("")}
    </div>
    <div class="detail-section-title">🔎 Popular Searches</div>
    <table class="admin-table"><thead><tr><th>Query</th><th>Count</th></tr></thead>
      <tbody>${searches.map((s) => `<tr><td>${escapeHtml(s.query)}</td><td>${s.count}</td></tr>`).join("") || "<tr><td colspan=2>No searches logged yet</td></tr>"}</tbody></table>
    <div class="detail-section-title">👤 Users</div>
    <table class="admin-table"><thead><tr><th>Username</th><th>Email</th><th>Joined</th><th>Admin</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${u.is_admin ? "✔" : ""}</td></tr>`).join("")}</tbody></table>`;
}

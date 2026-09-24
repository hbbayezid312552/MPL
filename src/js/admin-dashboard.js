(async function () {
  const shell = await initAdminShell({ active: "dashboard", title: "Dashboard" });
  if (!shell) return;
  const sb = window.supabaseClient;
  const { contentEl, profile } = shell;

  contentEl.innerHTML = `
    <div class="stat-cards" id="statCards"><p class="muted">Loading stats...</p></div>
    <div class="section-head"><h2>Quick Actions</h2></div>
    <div class="grid grid-4" id="quickActions"></div>
  `;

  const [{ count: teamsCount }, { count: playersCount }, { count: managersCount }, { data: matches }] = await Promise.all([
    sb.from("teams").select("*", { count: "exact", head: true }),
    sb.from("players").select("*", { count: "exact", head: true }),
    sb.from("team_managers").select("*", { count: "exact", head: true }),
    sb.from("matches").select("status"),
  ]);

  const live = (matches || []).filter(m => m.status === "Live" || m.status === "Paused").length;
  const upcoming = (matches || []).filter(m => m.status === "Upcoming").length;
  const completed = (matches || []).filter(m => m.status === "Completed").length;

  document.getElementById("statCards").innerHTML = `
    <div class="stat-card"><div class="num">${teamsCount ?? 0}</div><div class="label">Total Teams</div></div>
    <div class="stat-card"><div class="num">${playersCount ?? 0}</div><div class="label">Total Players</div></div>
    <div class="stat-card"><div class="num">${managersCount ?? 0}</div><div class="label">Total Managers</div></div>
    <div class="stat-card"><div class="num">${(matches || []).length}</div><div class="label">Total Matches</div></div>
    <div class="stat-card"><div class="num" style="color:var(--wicket-red);">${live}</div><div class="label">Live Matches</div></div>
    <div class="stat-card"><div class="num">${upcoming}</div><div class="label">Upcoming</div></div>
    <div class="stat-card"><div class="num">${completed}</div><div class="label">Completed</div></div>
  `;

  const actions = profile.role === "super_admin" ? [
    { href: "teams.html", label: "➕ Add Team" },
    { href: "players.html", label: "➕ Add Player" },
    { href: "matches.html", label: "🆕 Create Match" },
    { href: "scoring.html", label: "🔴 Start Live Match" },
    { href: "teams.html", label: "🛡️ Manage Teams" },
    { href: "players.html", label: "🏏 Manage Players" },
    { href: "matches.html", label: "📅 Manage Matches" },
    { href: "../points-table.html", label: "📈 Points Table" },
  ] : [
    { href: "matches.html", label: "📅 My Matches" },
    { href: "scoring.html", label: "🔴 Live Scoring" },
  ];
  document.getElementById("quickActions").innerHTML = actions.map(a => `<a href="${a.href}" class="card" style="text-align:center;font-weight:600;">${a.label}</a>`).join("");
})();

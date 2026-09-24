// Builds the admin sidebar + topbar. Call initAdminShell({ active, requiredRole }) from each admin page.
async function initAdminShell({ active, requiredRole = null, title = "Dashboard" }) {
  const auth = await requireAuth(requiredRole);
  if (!auth) return null;
  const { profile } = auth;

  const isSuper = profile.role === "super_admin";

  const navItems = [
    { key: "dashboard", href: "dashboard.html", label: "📊 Dashboard", roles: ["super_admin", "operator"] },
    { key: "teams", href: "teams.html", label: "🛡️ Teams", roles: ["super_admin"] },
    { key: "players", href: "players.html", label: "🏏 Players", roles: ["super_admin"] },
    { key: "matches", href: "matches.html", label: "📅 Matches", roles: ["super_admin", "operator"] },
    { key: "scoring", href: "scoring.html", label: "🎯 Live Scoring", roles: ["super_admin", "operator"] },
  ];

  const shell = document.createElement("div");
  shell.className = "admin-shell";
  shell.innerHTML = `
    <aside class="admin-sidebar" id="adminSidebar">
      <div class="brand">🏏 Admin Panel</div>
      <nav>
        ${navItems.filter(n => n.roles.includes(profile.role)).map(n => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.label}</a>`).join("")}
      </nav>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:0.78rem;color:rgba(255,255,255,0.55);">
        Logged in as<br><strong style="color:#fff;">${escapeHTML(profile.full_name || auth.session.user.email)}</strong><br>
        <span class="badge badge-gold" style="margin-top:6px;">${isSuper ? "Super Admin" : "Match Operator"}</span>
        <br><button id="logoutBtn" class="btn btn-outline btn-sm" style="margin-top:10px;color:#fff;border-color:rgba(255,255,255,0.3);">Log Out</button>
      </div>
    </aside>
    <main class="admin-main">
      <div class="admin-topbar">
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="mobile-sidebar-toggle btn btn-outline btn-sm" id="sidebarToggle">☰</button>
          <h1 style="margin:0;">${title}</h1>
        </div>
        <a href="../index.html" class="btn btn-outline btn-sm" target="_blank">View Site ↗</a>
      </div>
      <div id="adminContent"></div>
    </main>
  `;
  document.body.prepend(shell);

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await window.supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    document.getElementById("adminSidebar").classList.toggle("open");
  });

  return { profile, session: auth.session, contentEl: document.getElementById("adminContent") };
}

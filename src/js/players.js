(async function () {
  const sb = window.supabaseClient;
  let allPlayers = [];

  const { data, error } = await sb.from("players").select("*, team:teams(name, short_name)").eq("is_active", true).order("name");
  const el = document.getElementById("playersGrid");
  if (error) { showError(error, "players list"); el.innerHTML = emptyStateHTML("Could not load players."); return; }
  allPlayers = data || [];
  render(allPlayers);

  function render(list) {
    el.innerHTML = list.length ? list.map(p => `
      <a href="player.html?id=${p.id}" class="card player-card">
        <div class="avatar-circle">${p.photo_url ? `<img src="${p.photo_url}" alt="${escapeHTML(p.name)}">` : initials(p.name)}</div>
        <h3 style="font-size:0.95rem;margin:6px 0 0;">${escapeHTML(p.name)}</h3>
        <div class="muted" style="font-size:0.8rem;">${escapeHTML(p.team?.short_name || p.team?.name || "")} · #${p.jersey_number ?? "-"}</div>
        <span class="player-role-tag">${escapeHTML(p.role || "")}</span>
      </a>`).join("") : emptyStateHTML("No players match your search.");
  }

  function applyFilters() {
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const role = document.getElementById("roleFilter").value;
    render(allPlayers.filter(p =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (!role || p.role === role)
    ));
  }
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("roleFilter").addEventListener("change", applyFilters);
})();

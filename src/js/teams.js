(async function () {
  const sb = window.supabaseClient;
  const { data, error } = await sb.from("teams").select("*").eq("is_active", true).order("name");
  const el = document.getElementById("teamsGrid");
  if (error) { showError(error, "teams list"); el.innerHTML = emptyStateHTML("Could not load teams."); return; }
  if (!data.length) { el.innerHTML = emptyStateHTML("No teams have been added yet. Check back soon!"); return; }
  el.innerHTML = data.map(t => `
    <a href="team.html?id=${t.id}" class="card team-card">
      <div class="avatar-circle">${t.logo_url ? `<img src="${t.logo_url}" alt="${escapeHTML(t.name)}">` : initials(t.name)}</div>
      <h3>${escapeHTML(t.name)}</h3>
      <div class="muted">${escapeHTML(t.short_name || "")}</div>
    </a>`).join("");
})();

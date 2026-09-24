(async function () {
  const sb = window.supabaseClient;
  const teamId = new URLSearchParams(window.location.search).get("id");
  if (!teamId) { document.getElementById("teamName").textContent = "Team not found"; return; }

  const { data: team, error } = await sb.from("teams").select("*, team_managers(*)").eq("id", teamId).single();
  if (error || !team) { document.getElementById("teamName").textContent = "Team not found"; return; }

  document.title = team.name + " — Team Profile";
  document.getElementById("teamName").textContent = team.name;
  document.getElementById("teamLogo").innerHTML = team.logo_url ? `<img src="${team.logo_url}" alt="${escapeHTML(team.name)}">` : initials(team.name);
  const mgr = team.team_managers && team.team_managers[0];
  document.getElementById("teamManager").textContent = mgr ? `Team Manager: ${mgr.name}` : "";

  const { data: players } = await sb.from("players").select("*").eq("team_id", teamId).eq("is_active", true).order("jersey_number");
  const squadEl = document.getElementById("squadGrid");
  squadEl.innerHTML = (players && players.length)
    ? players.map(p => `
      <a href="player.html?id=${p.id}" class="card player-card">
        <div class="avatar-circle">${p.photo_url ? `<img src="${p.photo_url}" alt="${escapeHTML(p.name)}">` : initials(p.name)}</div>
        <h3 style="font-size:0.95rem;margin:6px 0 0;">${escapeHTML(p.name)}</h3>
        <div class="muted" style="font-size:0.8rem;">#${p.jersey_number ?? "-"}</div>
        <span class="player-role-tag">${escapeHTML(p.role || "")}</span>
      </a>`).join("")
    : emptyStateHTML("No players added to this squad yet.");

  const { data: pt } = await sb.from("points_table").select("*").eq("team_id", teamId).maybeSingle();
  document.getElementById("teamStats").innerHTML = `
    <div class="stat-card"><div class="num">${players ? players.length : 0}</div><div class="label">Squad Size</div></div>
    <div class="stat-card"><div class="num">${pt?.played ?? 0}</div><div class="label">Matches Played</div></div>
    <div class="stat-card"><div class="num">${pt?.won ?? 0}</div><div class="label">Wins</div></div>
    <div class="stat-card"><div class="num">${pt?.lost ?? 0}</div><div class="label">Losses</div></div>
    <div class="stat-card"><div class="num">${pt?.points ?? 0}</div><div class="label">Points</div></div>
  `;

  const MATCH_SELECT = `*, team_a:teams!matches_team_a_id_fkey(id,name,short_name,logo_url), team_b:teams!matches_team_b_id_fkey(id,name,short_name,logo_url), innings(id,batting_team_id,total_runs,total_wickets,total_overs)`;
  const { data: matches } = await sb.from("matches").select(MATCH_SELECT)
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order("match_date", { ascending: false }).limit(6);

  const matchesEl = document.getElementById("teamMatches");
  function avatar(t) { return t?.logo_url ? `<div class="avatar-circle"><img src="${t.logo_url}"></div>` : `<div class="avatar-circle">${initials(t?.name || "?")}</div>`; }
  function scoreLine(m, id) { const inn = (m.innings || []).find(i => i.batting_team_id === id); return inn ? `${inn.total_runs}/${inn.total_wickets} (${inn.total_overs} ov)` : "Yet to bat"; }
  matchesEl.innerHTML = (matches && matches.length) ? matches.map(m => `
    <a href="live.html?id=${m.id}" class="card match-card">
      <span class="status-badge status-${m.status}">${m.status === 'Live' ? '🔴 LIVE' : m.status.toUpperCase()}</span>
      <div class="match-teams-row">
        <div class="match-team">${avatar(m.team_a)}<div>${m.team_a?.short_name || ''}</div><div class="match-score">${scoreLine(m, m.team_a_id)}</div></div>
        <div class="match-vs">VS</div>
        <div class="match-team">${avatar(m.team_b)}<div>${m.team_b?.short_name || ''}</div><div class="match-score">${scoreLine(m, m.team_b_id)}</div></div>
      </div>
      <div class="match-meta">${formatDate(m.match_date)} ${m.result_text ? '· ' + escapeHTML(m.result_text) : ''}</div>
    </a>`).join("") : emptyStateHTML("No matches yet for this team.");
})();

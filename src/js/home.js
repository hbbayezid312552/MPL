const sb = window.supabaseClient;

const MATCH_SELECT = `*,
  team_a:teams!matches_team_a_id_fkey(id,name,short_name,logo_url),
  team_b:teams!matches_team_b_id_fkey(id,name,short_name,logo_url),
  innings(id,innings_number,batting_team_id,total_runs,total_wickets,total_overs,is_completed)`;

function teamAvatar(team) {
  if (!team) return `<div class="avatar-circle">?</div>`;
  if (team.logo_url) return `<div class="avatar-circle"><img src="${team.logo_url}" alt="${escapeHTML(team.name)}"></div>`;
  return `<div class="avatar-circle">${initials(team.name)}</div>`;
}

function matchScoreLine(match, teamId) {
  const inn = (match.innings || []).find(i => i.batting_team_id === teamId);
  if (!inn) return "Yet to bat";
  return `${inn.total_runs}/${inn.total_wickets} (${formatOvers ? "" : ""}${inn.total_overs} ov)`;
}

function renderMatchCard(match) {
  const link = `live.html?id=${match.id}`;
  return `
  <a href="${link}" class="card match-card">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="status-badge status-${match.status}">${match.status === 'Live' ? '🔴 LIVE' : match.status.toUpperCase()}</span>
      <span class="muted" style="font-size:.78rem;">${formatDate(match.match_date)}</span>
    </div>
    <div class="match-teams-row">
      <div class="match-team">${teamAvatar(match.team_a)}<div>${match.team_a?.short_name || match.team_a?.name || 'TBD'}</div><div class="match-score">${matchScoreLine(match, match.team_a_id)}</div></div>
      <div class="match-vs">VS</div>
      <div class="match-team">${teamAvatar(match.team_b)}<div>${match.team_b?.short_name || match.team_b?.name || 'TBD'}</div><div class="match-score">${matchScoreLine(match, match.team_b_id)}</div></div>
    </div>
    <div class="match-meta">${match.venue || ''} ${match.result_text ? '· ' + escapeHTML(match.result_text) : ''}</div>
  </a>`;
}

async function loadTournamentHeader() {
  const { data } = await sb.from("tournaments").select("*").eq("is_active", true).order("start_date", { ascending: false }).limit(1);
  const t = data && data[0];
  if (t) {
    document.getElementById("tournamentName").textContent = t.name;
    document.getElementById("site-name").textContent = t.name;
    document.title = t.name + " — Cricket Tournament";
    document.getElementById("tournamentVenue").textContent = t.venue || "Follow every match, every run, every wicket — live.";
    document.getElementById("tournamentDates").textContent = t.start_date ? `📅 ${formatDate(t.start_date)} – ${formatDate(t.end_date)}` : "";
    return t.id;
  } else {
    document.getElementById("tournamentName").textContent = window.SITE_CONFIG.SITE_NAME;
    return null;
  }
}

async function loadMatches(tournamentId) {
  let query = sb.from("matches").select(MATCH_SELECT).order("match_date", { ascending: true });
  if (tournamentId) query = query.eq("tournament_id", tournamentId);
  const { data, error } = await query;
  if (error) { showError(error, "loadMatches"); return; }

  const live = data.filter(m => m.status === "Live" || m.status === "Paused");
  const upcoming = data.filter(m => m.status === "Upcoming").slice(0, 6);
  const completed = data.filter(m => m.status === "Completed")
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date)).slice(0, 6);

  if (live.length) {
    document.getElementById("liveSection").style.display = "";
    document.getElementById("liveMatches").innerHTML = live.map(renderMatchCard).join("");
  }
  document.getElementById("upcomingMatches").innerHTML = upcoming.length
    ? upcoming.map(renderMatchCard).join("")
    : emptyStateHTML("No upcoming matches scheduled yet.");
  document.getElementById("recentResults").innerHTML = completed.length
    ? completed.map(renderMatchCard).join("")
    : emptyStateHTML("No completed matches yet.");
}

async function loadPointsPreview(tournamentId) {
  let query = sb.from("points_table").select("*, team:teams(name, short_name, logo_url)").order("points", { ascending: false }).order("net_run_rate", { ascending: false });
  if (tournamentId) query = query.eq("tournament_id", tournamentId);
  const { data, error } = await query;
  const tbody = document.querySelector("#pointsPreview tbody");
  if (error || !data || !data.length) { tbody.innerHTML = `<tr><td colspan="7" class="muted">No standings yet.</td></tr>`; return; }
  tbody.innerHTML = data.slice(0, 8).map((row, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHTML(row.team?.short_name || row.team?.name || "Team")}</td>
      <td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td>
      <td><strong>${row.points}</strong></td>
      <td>${Number(row.net_run_rate).toFixed(3)}</td>
    </tr>`).join("");
}

async function loadTeamsPreview(tournamentId) {
  let query = sb.from("teams").select("*").eq("is_active", true).limit(8);
  if (tournamentId) query = query.eq("tournament_id", tournamentId);
  const { data, error } = await query;
  const el = document.getElementById("teamsPreview");
  if (error || !data || !data.length) { el.innerHTML = emptyStateHTML("No teams added yet."); return; }
  el.innerHTML = data.map(t => `
    <a href="team.html?id=${t.id}" class="card team-card">
      ${teamAvatar(t)}
      <h3>${escapeHTML(t.name)}</h3>
      <div class="muted">${escapeHTML(t.short_name || "")}</div>
    </a>`).join("");
}

async function loadTopPerformers() {
  const { data: runsData } = await sb
    .from("batting_scores")
    .select("runs, player:players(name, team:teams(short_name,name))")
    .order("runs", { ascending: false })
    .limit(50);
  // Aggregate per player client-side (simple site, dataset is small)
  const runsAgg = {};
  (runsData || []).forEach(r => {
    if (!r.player) return;
    const key = r.player.name;
    runsAgg[key] = runsAgg[key] || { name: r.player.name, team: r.player.team?.short_name || r.player.team?.name, runs: 0 };
    runsAgg[key].runs += r.runs;
  });
  const topRuns = Object.values(runsAgg).sort((a, b) => b.runs - a.runs).slice(0, 5);
  document.querySelector("#topRuns tbody").innerHTML = topRuns.length
    ? topRuns.map(p => `<tr><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.team || "")}</td><td><strong>${p.runs}</strong></td></tr>`).join("")
    : `<tr><td colspan="3" class="muted">No data yet.</td></tr>`;

  const { data: wktData } = await sb
    .from("bowling_scores")
    .select("wickets, player:players(name, team:teams(short_name,name))")
    .order("wickets", { ascending: false })
    .limit(50);
  const wktAgg = {};
  (wktData || []).forEach(r => {
    if (!r.player) return;
    const key = r.player.name;
    wktAgg[key] = wktAgg[key] || { name: r.player.name, team: r.player.team?.short_name || r.player.team?.name, wickets: 0 };
    wktAgg[key].wickets += r.wickets;
  });
  const topWkts = Object.values(wktAgg).sort((a, b) => b.wickets - a.wickets).slice(0, 5);
  document.querySelector("#topWickets tbody").innerHTML = topWkts.length
    ? topWkts.map(p => `<tr><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.team || "")}</td><td><strong>${p.wickets}</strong></td></tr>`).join("")
    : `<tr><td colspan="3" class="muted">No data yet.</td></tr>`;
}

function setupFacebookShare() {
  const url = encodeURIComponent(window.SITE_CONFIG.SITE_URL);
  document.getElementById("fbShareHome").href = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
}

(async function init() {
  setupFacebookShare();
  const tournamentId = await loadTournamentHeader();
  await Promise.all([
    loadMatches(tournamentId),
    loadPointsPreview(tournamentId),
    loadTeamsPreview(tournamentId),
    loadTopPerformers()
  ]);

  // Realtime: refresh live section when matches or innings change
  sb.channel("home-live-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => loadMatches(tournamentId))
    .on("postgres_changes", { event: "*", schema: "public", table: "innings" }, () => loadMatches(tournamentId))
    .subscribe();
})();

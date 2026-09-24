(async function () {
  const sb = window.supabaseClient;
  const playerId = new URLSearchParams(window.location.search).get("id");
  if (!playerId) { document.getElementById("playerName").textContent = "Player not found"; return; }

  const { data: player, error } = await sb.from("players").select("*, team:teams(name, short_name)").eq("id", playerId).single();
  if (error || !player) { document.getElementById("playerName").textContent = "Player not found"; return; }

  document.title = player.name + " — Player Profile";
  document.getElementById("playerName").textContent = player.name;
  document.getElementById("playerPhoto").innerHTML = player.photo_url ? `<img src="${player.photo_url}" alt="${escapeHTML(player.name)}">` : initials(player.name);
  document.getElementById("playerMeta").textContent = `${player.team?.name || "Free Agent"} · #${player.jersey_number ?? "-"} · ${player.role || ""}`;
  document.getElementById("battingStyle").textContent = player.batting_style || "Not specified";
  document.getElementById("bowlingStyle").textContent = player.bowling_style || "Not specified";

  const { data: batting } = await sb.from("batting_scores").select("runs, balls_faced, innings_id").eq("player_id", playerId);
  const { data: bowling } = await sb.from("bowling_scores").select("wickets, overs_bowled, runs_conceded, innings_id").eq("player_id", playerId);

  const matchesSet = new Set([...(batting || []).map(b => b.innings_id), ...(bowling || []).map(b => b.innings_id)]);
  const totalRuns = (batting || []).reduce((s, b) => s + b.runs, 0);
  const totalWickets = (bowling || []).reduce((s, b) => s + b.wickets, 0);

  document.getElementById("playerStats").innerHTML = `
    <div class="stat-card"><div class="num">${matchesSet.size}</div><div class="label">Matches</div></div>
    <div class="stat-card"><div class="num">${totalRuns}</div><div class="label">Runs</div></div>
    <div class="stat-card"><div class="num">${totalWickets}</div><div class="label">Wickets</div></div>
  `;
})();

(function () {
  const sb = window.supabaseClient;
  const matchId = new URLSearchParams(window.location.search).get("id");
  if (!matchId) { document.getElementById("matchTitle").textContent = "Match not found"; return; }

  const MATCH_SELECT = `*,
    team_a:teams!matches_team_a_id_fkey(id,name,short_name,logo_url),
    team_b:teams!matches_team_b_id_fkey(id,name,short_name,logo_url)`;

  let match = null;

  async function loadAll() {
    const { data: m, error } = await sb.from("matches").select(MATCH_SELECT).eq("id", matchId).single();
    if (error || !m) { document.getElementById("matchTitle").textContent = "Match not found"; return; }
    match = m;

    const { data: innings } = await sb.from("innings").select("*").eq("match_id", matchId).order("innings_number");
    const current = (innings || []).slice().reverse().find(i => true) || null; // latest innings row = current
    const first = (innings || [])[0];

    renderHeader(match, innings || []);

    if (current) {
      await renderOnField(current);
      await renderCommentary(current.id);
      await renderFallOfWickets(current.id);
    }

    setupOG(match, current);
    setupFacebook(match, current);
  }

  function teamName(t) { return t ? (t.short_name || t.name) : "TBD"; }

  function renderHeader(match, innings) {
    document.getElementById("matchTitle").textContent = `${teamName(match.team_a)} vs ${teamName(match.team_b)}`;
    document.getElementById("matchVenue").textContent = `${match.venue || ""} ${match.match_date ? "· " + formatDate(match.match_date) : ""}`;
    const badge = document.getElementById("statusBadge");
    badge.textContent = match.status === "Live" ? "🔴 LIVE" : match.status.toUpperCase();
    badge.className = "status-badge status-" + match.status;

    const current = innings[innings.length - 1];
    if (current) {
      document.getElementById("mainScore").textContent = `${teamName(current.batting_team_id === match.team_a_id ? match.team_a : match.team_b)}  ${current.total_runs}/${current.total_wickets}`;
      document.getElementById("oversLine").textContent = `${current.total_overs} overs · CRR ${crr(current).toFixed(2)}`;
    }

    // Target / required-run-rate logic (2nd innings only)
    const target = document.getElementById("targetLine");
    if (innings.length === 2) {
      const first = innings[0], second = innings[1];
      const targetRuns = first.total_runs + 1;
      const runsReq = Math.max(targetRuns - second.total_runs, 0);
      const totalBalls = (match.overs_limit || 20) * 6;
      const ballsRemaining = Math.max(totalBalls - second.total_balls, 0);
      const rrr = ballsRemaining > 0 ? (runsReq / ballsRemaining * 6) : 0;
      if (!second.is_completed && match.status !== "Completed") {
        target.style.display = "";
        target.textContent = `🎯 Target: ${targetRuns}  ·  Need ${runsReq} runs from ${ballsRemaining} balls  ·  Required RR ${rrr.toFixed(2)}`;
      } else {
        target.style.display = "none";
      }
    } else {
      target.style.display = "none";
    }

    if (match.status === "Completed" && match.result_text) {
      document.getElementById("targetLine").style.display = "";
      document.getElementById("targetLine").textContent = "🏆 " + match.result_text;
    }
  }

  function crr(inn) {
    if (!inn.total_balls) return 0;
    return (inn.total_runs / inn.total_balls) * 6;
  }

  async function renderOnField(inn) {
    const ids = [inn.current_striker_id, inn.current_non_striker_id, inn.current_bowler_id].filter(Boolean);
    let players = {};
    if (ids.length) {
      const { data } = await sb.from("players").select("id,name").in("id", ids);
      (data || []).forEach(p => players[p.id] = p.name);
    }
    const { data: batting } = await sb.from("batting_scores").select("*").eq("innings_id", inn.id);
    const { data: bowling } = await sb.from("bowling_scores").select("*").eq("innings_id", inn.id);

    const strikerStat = (batting || []).find(b => b.player_id === inn.current_striker_id);
    const nonStrikerStat = (batting || []).find(b => b.player_id === inn.current_non_striker_id);
    const bowlerStat = (bowling || []).find(b => b.player_id === inn.current_bowler_id);

    document.getElementById("strikerLine").textContent = inn.current_striker_id
      ? `${players[inn.current_striker_id] || "Batter"}* ${strikerStat ? `${strikerStat.runs} (${strikerStat.balls_faced})` : ""}` : "-";
    document.getElementById("nonStrikerLine").textContent = inn.current_non_striker_id
      ? `${players[inn.current_non_striker_id] || "Batter"} ${nonStrikerStat ? `${nonStrikerStat.runs} (${nonStrikerStat.balls_faced})` : ""}` : "-";
    document.getElementById("bowlerLine").textContent = inn.current_bowler_id
      ? `${players[inn.current_bowler_id] || "Bowler"} ${bowlerStat ? `${formatOvers(bowlerStat.balls_bowled)}-${bowlerStat.runs_conceded}-${bowlerStat.wickets}` : ""}` : "-";

    const partnership = (strikerStat?.runs || 0) + (nonStrikerStat?.runs || 0);
    const extras = inn.extras_wide + inn.extras_noball + inn.extras_bye + inn.extras_legbye;
    document.getElementById("partnershipLine").textContent = `${partnership} runs · Extras ${extras}`;
  }

  async function renderCommentary(inningsId) {
    const { data } = await sb.from("commentary").select("*").eq("innings_id", inningsId).order("created_at", { ascending: false }).limit(40);
    const feed = document.getElementById("commentaryFeed");
    if (!data || !data.length) { feed.innerHTML = `<p class="muted">Commentary will appear here once the match starts.</p>`; return; }
    feed.innerHTML = data.map(c => {
      const cls = /wicket|out/i.test(c.text) ? "wicket" : /four|six|FOUR|SIX/i.test(c.text) ? "boundary" : "";
      return `<div class="comm-item ${cls}"><span class="comm-over">${escapeHTML(c.over_display || "")}</span>${escapeHTML(c.text)}</div>`;
    }).join("");
  }

  async function renderFallOfWickets(inningsId) {
    const { data } = await sb.from("ball_events").select("*, dismissed:players!ball_events_dismissed_player_id_fkey(name)")
      .eq("innings_id", inningsId).eq("event_type", "W").order("created_at");
    const el = document.getElementById("fowList");
    if (!data || !data.length) { el.innerHTML = `<p class="muted">No wickets yet.</p>`; return; }
    el.innerHTML = data.map(w => `<div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:0.85rem;">
      <strong>${escapeHTML(w.dismissed?.name || "Batter")}</strong> — ${escapeHTML(w.wicket_type || "Out")} (${w.over_number}.${w.ball_number})
    </div>`).join("");
  }

  function setupOG(match, current) {
    const title = `🔴 ${teamName(match.team_a)} vs ${teamName(match.team_b)} — Live Score`;
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("ogTitle").setAttribute("content", title);
    const desc = current ? `${current.total_runs}/${current.total_wickets} in ${current.total_overs} overs. Follow the live score now!` : "Follow the live score now!";
    document.getElementById("ogDesc").setAttribute("content", desc);
  }

  function setupFacebook(match, current) {
    const shareUrl = `${window.SITE_CONFIG.SITE_URL}live.html?id=${matchId}`;
    const text = current
      ? `🏏 ${teamName(match.team_a)} vs ${teamName(match.team_b)} — LIVE! Score: ${current.total_runs}/${current.total_wickets} (${current.total_overs} ov). Watch live:`
      : `🏏 ${teamName(match.team_a)} vs ${teamName(match.team_b)} — Follow live:`;
    document.getElementById("fbShareBtn").href =
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(text)}`;
  }

  loadAll();

  // Realtime: refresh whenever anything on this match changes — no page reload needed
  sb.channel("live-match-" + matchId)
    .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "innings", filter: `match_id=eq.${matchId}` }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "ball_events" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "commentary" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "batting_scores" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "bowling_scores" }, loadAll)
    .subscribe();
})();

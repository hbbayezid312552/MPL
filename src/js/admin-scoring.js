(async function () {
  const shell = await initAdminShell({ active: "scoring", title: "Live Scoring" });
  if (!shell) return;
  const sb = window.supabaseClient;
  const { contentEl, profile, session } = shell;
  const isSuper = profile.role === "super_admin";

  const matchId = new URLSearchParams(window.location.search).get("match");
  let match = null, innings = null, squadA = [], squadB = [], battingSquad = [], bowlingSquad = [];
  let battingScores = [], bowlingScores = [];

  if (!matchId) { await renderMatchPicker(); return; }
  await loadEverything();

  async function renderMatchPicker() {
    let q = sb.from("matches").select(`*, team_a:teams!matches_team_a_id_fkey(name), team_b:teams!matches_team_b_id_fkey(name)`)
      .in("status", ["Live", "Paused"]);
    if (!isSuper) q = q.eq("operator_id", session.user.id);
    const { data } = await q;
    contentEl.innerHTML = `
      <div class="section-head"><h2>Select a Live Match to Score</h2></div>
      <div class="grid grid-3">
        ${(data && data.length) ? data.map(m => `
          <a href="scoring.html?match=${m.id}" class="card match-card">
            <span class="status-badge status-${m.status}">${m.status}</span>
            <h3 style="margin:10px 0 0;">${escapeHTML(m.team_a?.name || "TBD")} vs ${escapeHTML(m.team_b?.name || "TBD")}</h3>
          </a>`).join("") : emptyStateHTML("No live or paused matches assigned to you. Start a match from the Matches page first.")}
      </div>
      <p style="margin-top:16px;"><a href="matches.html" class="btn btn-outline btn-sm">Go to Matches</a></p>
    `;
  }

  async function loadEverything() {
    const { data: m, error } = await sb.from("matches").select(`*,
      team_a:teams!matches_team_a_id_fkey(id,name,short_name),
      team_b:teams!matches_team_b_id_fkey(id,name,short_name)`).eq("id", matchId).single();
    if (error || !m) { contentEl.innerHTML = emptyStateHTML("Match not found."); return; }
    match = m;

    if (!isSuper && match.operator_id !== session.user.id) {
      contentEl.innerHTML = emptyStateHTML("This match is not assigned to you.");
      return;
    }

    const [{ data: pA }, { data: pB }] = await Promise.all([
      sb.from("players").select("*").eq("team_id", match.team_a_id).eq("is_active", true),
      sb.from("players").select("*").eq("team_id", match.team_b_id).eq("is_active", true),
    ]);
    squadA = pA || []; squadB = pB || [];

    const { data: inn } = await sb.from("innings").select("*").eq("match_id", matchId).order("innings_number", { ascending: false }).limit(1);
    innings = (inn && inn[0]) || null;

    if (!innings) {
      contentEl.innerHTML = emptyStateHTML("This match hasn't been started yet. Go to Matches and click Start.");
      return;
    }

    battingSquad = innings.batting_team_id === match.team_a_id ? squadA : squadB;
    bowlingSquad = innings.batting_team_id === match.team_a_id ? squadB : squadA;

    const [{ data: bat }, { data: bowl }] = await Promise.all([
      sb.from("batting_scores").select("*").eq("innings_id", innings.id),
      sb.from("bowling_scores").select("*").eq("innings_id", innings.id),
    ]);
    battingScores = bat || []; bowlingScores = bowl || [];

    render();
  }

  function playerName(id, squad) { return (squad.find(p => p.id === id) || {}).name || "Unknown"; }
  function teamName(t) { return t ? (t.short_name || t.name) : "TBD"; }

  function render() {
    if (match.status === "Completed") {
      contentEl.innerHTML = `<div class="card">${emptyStateHTML("This match is already completed.", "🏆")}<p style="text-align:center;">${escapeHTML(match.result_text || "")}</p></div>`;
      return;
    }

    if (!innings.current_striker_id || !innings.current_non_striker_id || !innings.current_bowler_id) {
      renderSetup();
      return;
    }

    if (innings.is_completed) {
      renderInningsBreak();
      return;
    }

    renderScoringUI();
  }

  function renderSetup() {
    contentEl.innerHTML = `
      <div class="card" style="max-width:520px;">
        <h3 style="margin-top:0;">Set Up Innings ${innings.innings_number}</h3>
        <p class="muted">${teamName(innings.batting_team_id === match.team_a_id ? match.team_a : match.team_b)} batting</p>
        <div class="form-group"><label>Striker (on strike)</label>
          <select id="setStriker">${battingSquad.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("")}</select>
        </div>
        <div class="form-group"><label>Non-Striker</label>
          <select id="setNonStriker">${battingSquad.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("")}</select>
        </div>
        <div class="form-group"><label>Opening Bowler</label>
          <select id="setBowler">${bowlingSquad.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("")}</select>
        </div>
        <button class="btn btn-primary btn-block" id="startInningsBtn">Start Scoring</button>
      </div>`;
    document.getElementById("startInningsBtn").addEventListener("click", async () => {
      const striker = document.getElementById("setStriker").value;
      const nonStriker = document.getElementById("setNonStriker").value;
      const bowler = document.getElementById("setBowler").value;
      if (striker === nonStriker) return toast("Striker and non-striker must be different players.", "error");
      const btn = document.getElementById("startInningsBtn");
      setLoading(btn, true, "Starting...");
      const { error } = await sb.from("innings").update({
        current_striker_id: striker, current_non_striker_id: nonStriker, current_bowler_id: bowler
      }).eq("id", innings.id);
      await ensureScoreRow("batting_scores", striker, { batting_position: 1 });
      await ensureScoreRow("batting_scores", nonStriker, { batting_position: 2 });
      await ensureScoreRow("bowling_scores", bowler, {}, true);
      setLoading(btn, false);
      if (error) return showError(error, "start innings");
      await loadEverything();
    });
  }

  function renderInningsBreak() {
    contentEl.innerHTML = `
      <div class="card" style="max-width:520px;text-align:center;">
        ${emptyStateHTML(`Innings ${innings.innings_number} complete: ${innings.total_runs}/${innings.total_wickets} (${innings.total_overs} ov)`, "🏏")}
        ${innings.innings_number === 1
          ? `<button class="btn btn-primary" id="start2ndBtn">Start 2nd Innings</button>`
          : `<button class="btn btn-primary" id="completeMatchBtn">Complete Match</button>`}
      </div>`;
    document.getElementById("start2ndBtn")?.addEventListener("click", async () => {
      const battingTeam = innings.bowling_team_id;
      const bowlingTeam = innings.batting_team_id;
      const { error } = await sb.from("innings").insert({ match_id: matchId, innings_number: 2, batting_team_id: battingTeam, bowling_team_id: bowlingTeam });
      if (error) return showError(error, "start 2nd innings");
      await loadEverything();
    });
    document.getElementById("completeMatchBtn")?.addEventListener("click", () => {
      window.location.href = `matches.html`;
      toast("Go to Matches and click 'Complete' to finalize the result.", "info");
    });
  }

  async function ensureScoreRow(table, playerId, extra, isBowler) {
    const { data: existing } = await sb.from(table).select("id").eq("innings_id", innings.id).eq("player_id", playerId).maybeSingle();
    if (existing) return existing.id;
    const payload = { innings_id: innings.id, player_id: playerId, ...extra };
    const { data, error } = await sb.from(table).insert(payload).select().single();
    if (error) { showError(error, "create score row"); return null; }
    return data.id;
  }

  function renderScoringUI() {
    const battingTeam = innings.batting_team_id === match.team_a_id ? match.team_a : match.team_b;
    const bowlingTeam = innings.batting_team_id === match.team_a_id ? match.team_b : match.team_a;
    const strikerStat = battingScores.find(b => b.player_id === innings.current_striker_id) || {};
    const nonStrikerStat = battingScores.find(b => b.player_id === innings.current_non_striker_id) || {};
    const bowlerStat = bowlingScores.find(b => b.player_id === innings.current_bowler_id) || {};
    const crr = innings.total_balls ? (innings.total_runs / innings.total_balls * 6) : 0;

    contentEl.innerHTML = `
      <div class="score-strip">
        <div class="teams-line">
          <div>
            <div class="big-score">${teamName(battingTeam)} ${innings.total_runs}/${innings.total_wickets}</div>
            <div class="sub">${innings.total_overs} ov · CRR ${crr.toFixed(2)} · vs ${teamName(bowlingTeam)}</div>
          </div>
          <button class="btn btn-outline btn-sm" id="undoBtn" style="color:#fff;border-color:rgba(255,255,255,0.4);">↩ Undo Last Ball</button>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:2fr 1fr;align-items:start;">
        <div>
          <div class="card" style="margin-bottom:14px;">
            <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
              <div><div class="muted" style="font-size:0.75rem;">Striker*</div><strong>${playerName(innings.current_striker_id, battingSquad)}</strong><div class="muted">${strikerStat.runs || 0} (${strikerStat.balls_faced || 0})</div></div>
              <div><div class="muted" style="font-size:0.75rem;">Non-Striker</div><strong>${playerName(innings.current_non_striker_id, battingSquad)}</strong><div class="muted">${nonStrikerStat.runs || 0} (${nonStrikerStat.balls_faced || 0})</div></div>
              <div><div class="muted" style="font-size:0.75rem;">Bowler</div><strong>${playerName(innings.current_bowler_id, bowlingSquad)}</strong><div class="muted">${formatOvers(bowlerStat.balls_bowled || 0)}-${bowlerStat.runs_conceded || 0}-${bowlerStat.wickets || 0}</div></div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" id="swapBatterBtn">🔁 Swap Strike</button>
              <button class="btn btn-outline btn-sm" id="changeBowlerBtn">Change Bowler</button>
              <button class="btn btn-outline btn-sm" id="retireBtn">Retire Batter</button>
            </div>
            <div class="ball-btn-grid">
              <button class="ball-btn run" data-run="0">0</button>
              <button class="ball-btn run" data-run="1">1</button>
              <button class="ball-btn run" data-run="2">2</button>
              <button class="ball-btn run" data-run="3">3</button>
              <button class="ball-btn run" data-run="4">FOUR</button>
              <button class="ball-btn run" data-run="6">SIX</button>
              <button class="ball-btn extra" data-extra="WD">Wide</button>
              <button class="ball-btn extra" data-extra="NB">No Ball</button>
              <button class="ball-btn extra" data-extra="B">Bye</button>
              <button class="ball-btn extra" data-extra="LB">Leg Bye</button>
              <button class="ball-btn wicket" data-wicket="1" style="grid-column:span 2;">WICKET</button>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-top:0;">Add Commentary</h3>
            <div style="display:flex;gap:8px;">
              <input id="manualCommentary" placeholder="Add a note for this moment...">
              <button class="btn btn-outline btn-sm" id="addCommentaryBtn">Add</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0;">Commentary</h3>
          <div class="commentary-feed" id="scoringCommentary"><p class="muted">No balls bowled yet.</p></div>
        </div>
      </div>
      <div id="scoringModalRoot"></div>
    `;

    document.querySelectorAll("[data-run]").forEach(b => b.addEventListener("click", () => processBall(Number(b.dataset.run))));
    document.querySelectorAll("[data-extra]").forEach(b => b.addEventListener("click", () => processExtra(b.dataset.extra)));
    document.getElementById("undoBtn").addEventListener("click", undoLastBall);
    document.querySelector("[data-wicket]").addEventListener("click", openWicketModal);
    document.getElementById("swapBatterBtn").addEventListener("click", () => swapStrike(false));
    document.getElementById("changeBowlerBtn").addEventListener("click", openBowlerModal);
    document.getElementById("retireBtn").addEventListener("click", openRetireModal);
    document.getElementById("addCommentaryBtn").addEventListener("click", addManualCommentary);
    loadCommentary();
  }

  async function loadCommentary() {
    const { data } = await sb.from("commentary").select("*").eq("innings_id", innings.id).order("created_at", { ascending: false }).limit(30);
    const el = document.getElementById("scoringCommentary");
    if (!el) return;
    if (!data || !data.length) { el.innerHTML = `<p class="muted">No balls bowled yet.</p>`; return; }
    el.innerHTML = data.map(c => {
      const cls = /wicket/i.test(c.text) ? "wicket" : /four|six/i.test(c.text) ? "boundary" : "";
      return `<div class="comm-item ${cls}"><span class="comm-over">${escapeHTML(c.over_display || "")}</span>${escapeHTML(c.text)}</div>`;
    }).join("");
  }

  function overDisplay() {
    const overs = Math.floor(innings.total_balls / 6);
    const balls = (innings.total_balls % 6) + 1;
    return `${overs}.${balls}`;
  }

  async function addCommentary(text) {
    await sb.from("commentary").insert({ innings_id: innings.id, over_display: overDisplay(), text });
  }

  async function addManualCommentary() {
    const input = document.getElementById("manualCommentary");
    const text = input.value.trim();
    if (!text) return;
    await addCommentary(text);
    input.value = "";
    loadCommentary();
  }

  // ---------------- Core ball processing ----------------
  async function processBall(runs) {
    const striker = innings.current_striker_id, nonStriker = innings.current_non_striker_id, bowler = innings.current_bowler_id;
    const overBefore = overDisplay();

    await sb.from("ball_events").insert({
      innings_id: innings.id, over_number: Math.floor(innings.total_balls / 6), ball_number: (innings.total_balls % 6) + 1,
      striker_id: striker, non_striker_id: nonStriker, bowler_id: bowler,
      event_type: String(runs), runs, is_legal_ball: true,
    });

    const strikerRow = battingScores.find(b => b.player_id === striker);
    await sb.from("batting_scores").update({
      runs: (strikerRow?.runs || 0) + runs,
      balls_faced: (strikerRow?.balls_faced || 0) + 1,
      fours: (strikerRow?.fours || 0) + (runs === 4 ? 1 : 0),
      sixes: (strikerRow?.sixes || 0) + (runs === 6 ? 1 : 0),
    }).eq("id", strikerRow.id);

    const bowlerRow = bowlingScores.find(b => b.player_id === bowler);
    const newBalls = (bowlerRow?.balls_bowled || 0) + 1;
    await sb.from("bowling_scores").update({
      runs_conceded: (bowlerRow?.runs_conceded || 0) + runs,
      balls_bowled: newBalls,
      overs_bowled: Math.floor(newBalls / 6) + (newBalls % 6) / 10,
    }).eq("id", bowlerRow.id);

    const newTotalBalls = innings.total_balls + 1;
    await sb.from("innings").update({
      total_runs: innings.total_runs + runs,
      total_balls: newTotalBalls,
      total_overs: Math.floor(newTotalBalls / 6) + (newTotalBalls % 6) / 10,
    }).eq("id", innings.id);

    await addCommentary(`${runs === 0 ? "Dot ball" : runs === 4 ? "FOUR!" : runs === 6 ? "SIX!" : runs + " run" + (runs > 1 ? "s" : "")}`);

    const endOfOver = newTotalBalls % 6 === 0;
    await afterBall({ runsOnBall: runs, endOfOver, rotateOnOdd: true });
  }

  async function processExtra(type) {
    const striker = innings.current_striker_id, nonStriker = innings.current_non_striker_id, bowler = innings.current_bowler_id;
    let runs = 1, isLegal = false, label = "";

    if (type === "WD") { runs = 1; label = "Wide"; }
    if (type === "NB") {
      const extra = prompt("Runs scored off the bat on this no ball? (0 if none)", "0");
      const off = Math.max(0, parseInt(extra || "0", 10) || 0);
      runs = 1 + off; label = "No Ball" + (off ? ` + ${off} run(s)` : "");
    }
    if (type === "B" || type === "LB") {
      const amt = prompt(`How many ${type === "B" ? "byes" : "leg byes"}?`, "1");
      runs = Math.max(1, parseInt(amt || "1", 10) || 1);
      isLegal = true;
      label = `${type === "B" ? "Bye" : "Leg Bye"} x${runs}`;
    }

    await sb.from("ball_events").insert({
      innings_id: innings.id,
      over_number: Math.floor(innings.total_balls / 6), ball_number: isLegal ? (innings.total_balls % 6) + 1 : (innings.total_balls % 6),
      striker_id: striker, non_striker_id: nonStriker, bowler_id: bowler,
      event_type: type, runs, is_legal_ball: isLegal,
    });

    const extrasPatch = {};
    if (type === "WD") extrasPatch.extras_wide = innings.extras_wide + 1;
    if (type === "NB") extrasPatch.extras_noball = innings.extras_noball + 1;
    if (type === "B") extrasPatch.extras_bye = innings.extras_bye + runs;
    if (type === "LB") extrasPatch.extras_legbye = innings.extras_legbye + runs;

    const bowlerRow = bowlingScores.find(b => b.player_id === bowler);
    const runsToBowler = (type === "B" || type === "LB") ? 0 : runs; // byes/leg byes don't count against bowler
    const newBalls = isLegal ? (bowlerRow?.balls_bowled || 0) + 1 : (bowlerRow?.balls_bowled || 0);
    await sb.from("bowling_scores").update({
      runs_conceded: (bowlerRow?.runs_conceded || 0) + runsToBowler,
      balls_bowled: newBalls,
      overs_bowled: Math.floor(newBalls / 6) + (newBalls % 6) / 10,
    }).eq("id", bowlerRow.id);

    if (isLegal) {
      const strikerRow = battingScores.find(b => b.player_id === striker);
      await sb.from("batting_scores").update({ balls_faced: (strikerRow?.balls_faced || 0) + 1 }).eq("id", strikerRow.id);
    }

    const newTotalBalls = isLegal ? innings.total_balls + 1 : innings.total_balls;
    await sb.from("innings").update({
      total_runs: innings.total_runs + runs,
      total_balls: newTotalBalls,
      total_overs: Math.floor(newTotalBalls / 6) + (newTotalBalls % 6) / 10,
      ...extrasPatch,
    }).eq("id", innings.id);

    await addCommentary(label);
    const endOfOver = isLegal && newTotalBalls % 6 === 0;
    await afterBall({ runsOnBall: runs, endOfOver, rotateOnOdd: isLegal });
  }

  function openWicketModal() {
    const root = document.getElementById("scoringModalRoot");
    root.innerHTML = `
      <div class="modal-overlay" id="wicketOverlay">
        <div class="modal-box">
          <h3>Record Wicket</h3>
          <div class="form-group"><label>Who is out?</label>
            <select id="w_who">
              <option value="${innings.current_striker_id}">${escapeHTML(playerName(innings.current_striker_id, battingSquad))} (striker)</option>
              <option value="${innings.current_non_striker_id}">${escapeHTML(playerName(innings.current_non_striker_id, battingSquad))} (non-striker)</option>
            </select>
          </div>
          <div class="form-group"><label>Wicket Type</label>
            <select id="w_type">
              ${["Bowled","Caught","LBW","Run Out","Stumped","Hit Wicket","Retired Hurt","Other"].map(t => `<option>${t}</option>`).join("")}
            </select>
          </div>
          <div class="form-group"><label>New Batter</label>
            <select id="w_newbatter">${battingSquad.filter(p => ![innings.current_striker_id, innings.current_non_striker_id].includes(p.id) && !battingScores.some(b => b.player_id === p.id && b.is_out)).map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("") || `<option value="">All out</option>`}</select>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-outline btn-block" id="cancelWicket">Cancel</button>
            <button type="button" class="btn btn-danger btn-block" id="confirmWicket">Confirm Wicket</button>
          </div>
        </div>
      </div>`;
    document.getElementById("cancelWicket").addEventListener("click", () => root.innerHTML = "");
    document.getElementById("confirmWicket").addEventListener("click", () => processWicket());
  }

  async function processWicket() {
    const dismissedId = document.getElementById("w_who").value;
    const wicketType = document.getElementById("w_type").value;
    const newBatterId = document.getElementById("w_newbatter").value || null;
    const bowler = innings.current_bowler_id;
    const striker = innings.current_striker_id, nonStriker = innings.current_non_striker_id;

    await sb.from("ball_events").insert({
      innings_id: innings.id, over_number: Math.floor(innings.total_balls / 6), ball_number: (innings.total_balls % 6) + 1,
      striker_id: striker, non_striker_id: nonStriker, bowler_id: bowler,
      event_type: "W", runs: 0, wicket_type: wicketType, dismissed_player_id: dismissedId, is_legal_ball: true,
    });

    const dismissedRow = battingScores.find(b => b.player_id === dismissedId);
    await sb.from("batting_scores").update({
      is_out: true, how_out: wicketType,
      balls_faced: dismissedId === striker ? (dismissedRow?.balls_faced || 0) + 1 : (dismissedRow?.balls_faced || 0),
    }).eq("id", dismissedRow.id);

    if (wicketType !== "Run Out") {
      const bowlerRow = bowlingScores.find(b => b.player_id === bowler);
      await sb.from("bowling_scores").update({ wickets: (bowlerRow?.wickets || 0) + 1 }).eq("id", bowlerRow.id);
    }
    const bowlerRow2 = bowlingScores.find(b => b.player_id === bowler);
    const newBalls = (bowlerRow2?.balls_bowled || 0) + 1;
    await sb.from("bowling_scores").update({ balls_bowled: newBalls, overs_bowled: Math.floor(newBalls / 6) + (newBalls % 6) / 10 }).eq("id", bowlerRow2.id);

    const newTotalBalls = innings.total_balls + 1;
    const newWickets = innings.total_wickets + 1;
    await sb.from("innings").update({
      total_wickets: newWickets, total_balls: newTotalBalls,
      total_overs: Math.floor(newTotalBalls / 6) + (newTotalBalls % 6) / 10,
    }).eq("id", innings.id);

    await addCommentary(`WICKET! ${playerName(dismissedId, battingSquad)} ${wicketType}`);
    document.getElementById("scoringModalRoot").innerHTML = "";

    const allOut = newWickets >= 10 || !newBatterId;
    if (allOut) {
      await sb.from("innings").update({ is_completed: true }).eq("id", innings.id);
      await loadEverything();
      return;
    }
    // Bring in new batter to the slot that was dismissed
    const patch = dismissedId === striker ? { current_striker_id: newBatterId } : { current_non_striker_id: newBatterId };
    await sb.from("innings").update(patch).eq("id", innings.id);
    await ensureScoreRow("batting_scores", newBatterId, { batting_position: battingScores.length + 1 });

    const endOfOver = newTotalBalls % 6 === 0;
    await afterBall({ runsOnBall: 0, endOfOver, rotateOnOdd: false, skipReload: false });
  }

  async function afterBall({ endOfOver, rotateOnOdd, runsOnBall }) {
    if (rotateOnOdd && runsOnBall % 2 === 1) {
      await swapStrike(true);
    }
    // Refresh local state first
    await refreshLocalInnings();

    if (checkInningsOver()) {
      await sb.from("innings").update({ is_completed: true }).eq("id", innings.id);
      await loadEverything();
      return;
    }

    if (endOfOver) {
      await swapStrike(true, true); // strike rotates at over change
      openBowlerModal(true);
      return;
    }
    await loadEverything();
  }

  function checkInningsOver() {
    const ballsLimit = (match.overs_limit || 20) * 6;
    if (innings.total_wickets >= 10) return true;
    if (innings.total_balls >= ballsLimit) return true;
    if (innings.innings_number === 2) {
      // chasing team passed the target
      return false; // target check handled visually; scorer manually completes match
    }
    return false;
  }

  async function refreshLocalInnings() {
    const { data } = await sb.from("innings").select("*").eq("id", innings.id).single();
    if (data) innings = data;
    const [{ data: bat }, { data: bowl }] = await Promise.all([
      sb.from("batting_scores").select("*").eq("innings_id", innings.id),
      sb.from("bowling_scores").select("*").eq("innings_id", innings.id),
    ]);
    battingScores = bat || []; bowlingScores = bowl || [];
  }

  async function swapStrike(silent, forceApply) {
    const s = innings.current_striker_id, n = innings.current_non_striker_id;
    await sb.from("innings").update({ current_striker_id: n, current_non_striker_id: s }).eq("id", innings.id);
    innings.current_striker_id = n; innings.current_non_striker_id = s;
    if (!silent) { await loadEverything(); }
  }

  function openBowlerModal(forcedAfterOver) {
    const root = document.getElementById("scoringModalRoot") || (() => { const d = document.createElement("div"); d.id = "scoringModalRoot"; contentEl.appendChild(d); return d; })();
    root.innerHTML = `
      <div class="modal-overlay" id="bowlerOverlay">
        <div class="modal-box">
          <h3>${forcedAfterOver ? "Over Complete — Select Next Bowler" : "Change Bowler"}</h3>
          <div class="form-group"><label>Bowler</label>
            <select id="b_bowler">${bowlingSquad.filter(p => p.id !== innings.current_bowler_id).map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("")}</select>
          </div>
          <button class="btn btn-primary btn-block" id="confirmBowler">Confirm</button>
        </div>
      </div>`;
    document.getElementById("confirmBowler").addEventListener("click", async () => {
      const bowlerId = document.getElementById("b_bowler").value;
      await sb.from("innings").update({ current_bowler_id: bowlerId }).eq("id", innings.id);
      await ensureScoreRow("bowling_scores", bowlerId, {}, true);
      document.getElementById("bowlerOverlay")?.remove();
      await loadEverything();
    });
  }

  function openRetireModal() {
    const root = document.getElementById("scoringModalRoot");
    root.innerHTML = `
      <div class="modal-overlay" id="retireOverlay">
        <div class="modal-box">
          <h3>Retire Batter</h3>
          <div class="form-group"><label>Who is retiring?</label>
            <select id="r_who">
              <option value="${innings.current_striker_id}">${escapeHTML(playerName(innings.current_striker_id, battingSquad))} (striker)</option>
              <option value="${innings.current_non_striker_id}">${escapeHTML(playerName(innings.current_non_striker_id, battingSquad))} (non-striker)</option>
            </select>
          </div>
          <div class="form-group"><label>Replacement Batter</label>
            <select id="r_new">${battingSquad.filter(p => ![innings.current_striker_id, innings.current_non_striker_id].includes(p.id)).map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("")}</select>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-outline btn-block" id="cancelRetire">Cancel</button>
            <button type="button" class="btn btn-primary btn-block" id="confirmRetire">Confirm</button>
          </div>
        </div>
      </div>`;
    document.getElementById("cancelRetire").addEventListener("click", () => root.innerHTML = "");
    document.getElementById("confirmRetire").addEventListener("click", async () => {
      const who = document.getElementById("r_who").value;
      const replacement = document.getElementById("r_new").value;
      const patch = who === innings.current_striker_id ? { current_striker_id: replacement } : { current_non_striker_id: replacement };
      const dismissedRow = battingScores.find(b => b.player_id === who);
      if (dismissedRow) await sb.from("batting_scores").update({ is_out: true, how_out: "Retired Hurt" }).eq("id", dismissedRow.id);
      await ensureScoreRow("batting_scores", replacement, { batting_position: battingScores.length + 1 });
      await sb.from("innings").update(patch).eq("id", innings.id);
      await addCommentary(`${playerName(who, battingSquad)} retires. ${playerName(replacement, battingSquad)} comes in.`);
      root.innerHTML = "";
      await loadEverything();
    });
  }

  // Undo simply informs the scorer — full undo of aggregated stats is not supported to keep data consistent.
  function undoLastBall() {
    toast("For data accuracy, corrections should be made via the Super Admin panel. Continue scoring the next ball.", "info");
  }
})();

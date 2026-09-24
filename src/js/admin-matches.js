(async function () {
  const shell = await initAdminShell({ active: "matches", title: "Manage Matches" });
  if (!shell) return;
  const sb = window.supabaseClient;
  const { contentEl, profile } = shell;
  const isSuper = profile.role === "super_admin";

  let teams = [], tournaments = [], operators = [], matches = [];

  contentEl.innerHTML = `
    <div class="admin-topbar" style="margin-bottom:14px;">
      <div></div>
      ${isSuper ? `<button class="btn btn-primary" id="addMatchBtn">🆕 Create Match</button>` : ""}
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Match</th><th>Venue</th><th>Status</th><th>Operator</th><th>Actions</th></tr></thead>
        <tbody id="matchesBody"><tr><td colspan="6" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
    <div id="modalRoot"></div>
  `;

  async function loadRefs() {
    const [{ data: t }, { data: tour }, { data: ops }] = await Promise.all([
      sb.from("teams").select("id,name,tournament_id").order("name"),
      sb.from("tournaments").select("id,name").order("start_date", { ascending: false }),
      sb.from("profiles").select("id,full_name").eq("role", "operator"),
    ]);
    teams = t || []; tournaments = tour || []; operators = ops || [];
  }

  async function loadMatches() {
    let q = sb.from("matches").select(`*,
      team_a:teams!matches_team_a_id_fkey(name,short_name),
      team_b:teams!matches_team_b_id_fkey(name,short_name),
      operator:profiles(full_name)`).order("match_date", { ascending: false });
    if (!isSuper) q = q.eq("operator_id", shell.session.user.id);
    const { data, error } = await q;
    if (error) return showError(error, "load matches");
    matches = data || [];
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById("matchesBody");
    if (!matches.length) { tbody.innerHTML = `<tr><td colspan="6">${emptyStateHTML(isSuper ? "No matches yet. Create one to get started." : "No matches assigned to you yet.")}</td></tr>`; return; }
    tbody.innerHTML = matches.map(m => `
      <tr>
        <td>${formatDate(m.match_date)}${m.match_time ? " " + m.match_time.slice(0,5) : ""}</td>
        <td><strong>${escapeHTML(m.team_a?.short_name || m.team_a?.name || "TBD")} vs ${escapeHTML(m.team_b?.short_name || m.team_b?.name || "TBD")}</strong></td>
        <td>${escapeHTML(m.venue || "-")}</td>
        <td><span class="status-badge status-${m.status}">${m.status}</span></td>
        <td>${escapeHTML(m.operator?.full_name || "-")}</td>
        <td style="white-space:nowrap;display:flex;gap:6px;flex-wrap:wrap;">
          ${isSuper ? `<button class="btn btn-outline btn-sm" data-edit="${m.id}">Edit</button>` : ""}
          ${m.status === "Upcoming" ? `<button class="btn btn-gold btn-sm" data-start="${m.id}">Start</button>` : ""}
          ${m.status === "Live" ? `<button class="btn btn-outline btn-sm" data-pause="${m.id}">Pause</button>` : ""}
          ${m.status === "Paused" ? `<button class="btn btn-outline btn-sm" data-resume="${m.id}">Resume</button>` : ""}
          ${(m.status === "Live" || m.status === "Paused") ? `<a class="btn btn-primary btn-sm" href="scoring.html?match=${m.id}">Score</a>
            <button class="btn btn-outline btn-sm" data-complete="${m.id}">Complete</button>` : ""}
          ${isSuper ? `<button class="btn btn-danger btn-sm" data-delete="${m.id}">Delete</button>` : ""}
        </td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openModal(matches.find(m => m.id === b.dataset.edit))));
    tbody.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deleteMatch(b.dataset.delete)));
    tbody.querySelectorAll("[data-start]").forEach(b => b.addEventListener("click", () => startMatch(b.dataset.start)));
    tbody.querySelectorAll("[data-pause]").forEach(b => b.addEventListener("click", () => setStatus(b.dataset.pause, "Paused")));
    tbody.querySelectorAll("[data-resume]").forEach(b => b.addEventListener("click", () => setStatus(b.dataset.resume, "Live")));
    tbody.querySelectorAll("[data-complete]").forEach(b => b.addEventListener("click", () => openCompleteModal(matches.find(m => m.id === b.dataset.complete))));
  }

  async function setStatus(id, status) {
    const { error } = await sb.from("matches").update({ status }).eq("id", id);
    if (error) return showError(error, "update match status");
    toast(`Match ${status.toLowerCase()}.`, "success");
    loadMatches();
  }

  async function startMatch(id) {
    const m = matches.find(x => x.id === id);
    // Create first innings if it doesn't exist yet
    const { data: existing } = await sb.from("innings").select("id").eq("match_id", id).eq("innings_number", 1).maybeSingle();
    if (!existing) {
      const battingTeam = m.toss_decision === "Bowl" ? (m.toss_winner_id === m.team_a_id ? m.team_b_id : m.team_a_id) : (m.toss_winner_id || m.team_a_id);
      const bowlingTeam = battingTeam === m.team_a_id ? m.team_b_id : m.team_a_id;
      const { error } = await sb.from("innings").insert({ match_id: id, innings_number: 1, batting_team_id: battingTeam, bowling_team_id: bowlingTeam });
      if (error) return showError(error, "start match");
    }
    await setStatus(id, "Live");
  }

  async function deleteMatch(id) {
    if (!confirmAction("Delete this match and all its scoring data? This cannot be undone.")) return;
    const { error } = await sb.from("matches").delete().eq("id", id);
    if (error) return showError(error, "delete match");
    toast("Match deleted.", "success");
    loadMatches();
  }

  function openCompleteModal(match) {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-overlay" id="completeOverlay">
        <div class="modal-box">
          <h3>Complete Match</h3>
          <div class="form-group">
            <label>Result</label>
            <select id="f_winner">
              <option value="${match.team_a_id}">${escapeHTML(match.team_a?.name || "Team A")} won</option>
              <option value="${match.team_b_id}">${escapeHTML(match.team_b?.name || "Team B")} won</option>
              <option value="">Tie / No Result</option>
            </select>
          </div>
          <div class="form-group"><label>Result Summary (shown publicly)</label><input id="f_result" placeholder="e.g. Thunder Strikers won by 24 runs"></div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-outline btn-block" id="cancelComplete">Cancel</button>
            <button type="button" class="btn btn-primary btn-block" id="confirmComplete">Complete Match</button>
          </div>
        </div>
      </div>`;
    document.getElementById("cancelComplete").addEventListener("click", () => root.innerHTML = "");
    document.getElementById("confirmComplete").addEventListener("click", () => completeMatch(match));
  }

  async function completeMatch(match) {
    const btn = document.getElementById("confirmComplete");
    setLoading(btn, true, "Completing...");
    try {
      const winner_id = document.getElementById("f_winner").value || null;
      const result_text = document.getElementById("f_result").value.trim();
      const { error } = await sb.from("matches").update({ status: "Completed", winner_id, result_text }).eq("id", match.id);
      if (error) throw error;
      await recomputePointsTable(match.tournament_id);
      toast("Match completed and points table updated.", "success");
      document.getElementById("modalRoot").innerHTML = "";
      loadMatches();
    } catch (err) {
      showError(err, "complete match");
    } finally {
      setLoading(btn, false);
    }
  }

  // Recalculates the entire points table for a tournament from completed matches + innings data
  async function recomputePointsTable(tournamentId) {
    if (!tournamentId) return;
    const { data: tTeams } = await sb.from("teams").select("id").eq("tournament_id", tournamentId);
    const { data: cMatches } = await sb.from("matches").select("*, innings(*)").eq("tournament_id", tournamentId).eq("status", "Completed");

    for (const team of (tTeams || [])) {
      let played = 0, won = 0, lost = 0, noResult = 0;
      let runsFor = 0, ballsFor = 0, runsAgainst = 0, ballsAgainst = 0;

      for (const m of (cMatches || [])) {
        if (m.team_a_id !== team.id && m.team_b_id !== team.id) continue;
        played++;
        if (!m.winner_id) noResult++;
        else if (m.winner_id === team.id) won++;
        else lost++;

        (m.innings || []).forEach(inn => {
          if (inn.batting_team_id === team.id) { runsFor += inn.total_runs; ballsFor += inn.total_balls; }
          else { runsAgainst += inn.total_runs; ballsAgainst += inn.total_balls; }
        });
      }
      const points = won * 2 + noResult * 1;
      const rrFor = ballsFor ? (runsFor / (ballsFor / 6)) : 0;
      const rrAgainst = ballsAgainst ? (runsAgainst / (ballsAgainst / 6)) : 0;
      const nrr = rrFor - rrAgainst;

      await sb.from("points_table").upsert({
        tournament_id: tournamentId, team_id: team.id,
        played, won, lost, no_result: noResult, points, net_run_rate: nrr,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tournament_id,team_id" });
    }
  }

  function openModal(match = null) {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-overlay" id="matchModalOverlay">
        <div class="modal-box">
          <h3>${match ? "Edit Match" : "Create Match"}</h3>
          <form id="matchForm">
            <div class="form-group"><label>Tournament</label>
              <select id="f_tournament">
                <option value="">— None —</option>
                ${tournaments.map(t => `<option value="${t.id}" ${match?.tournament_id === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`).join("")}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Team A *</label>
                <select id="f_teamA" required>${teams.map(t => `<option value="${t.id}" ${match?.team_a_id === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`).join("")}</select>
              </div>
              <div class="form-group"><label>Team B *</label>
                <select id="f_teamB" required>${teams.map(t => `<option value="${t.id}" ${match?.team_b_id === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`).join("")}</select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Match Date</label><input type="date" id="f_date" value="${match?.match_date || ""}"></div>
              <div class="form-group"><label>Match Time</label><input type="time" id="f_time" value="${match?.match_time?.slice(0,5) || ""}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Venue</label><input id="f_venue" value="${match ? escapeHTML(match.venue || "") : ""}"></div>
              <div class="form-group"><label>Overs Limit</label><input type="number" id="f_overs" value="${match?.overs_limit ?? 20}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Toss Winner</label>
                <select id="f_toss_winner"><option value="">—</option>${teams.map(t => `<option value="${t.id}" ${match?.toss_winner_id === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`).join("")}</select>
              </div>
              <div class="form-group"><label>Toss Decision</label>
                <select id="f_toss_decision"><option value="">—</option><option ${match?.toss_decision === "Bat" ? "selected" : ""}>Bat</option><option ${match?.toss_decision === "Bowl" ? "selected" : ""}>Bowl</option></select>
              </div>
            </div>
            <div class="form-group"><label>Assign Match Operator (optional)</label>
              <select id="f_operator"><option value="">— Super Admin only —</option>${operators.map(o => `<option value="${o.id}" ${match?.operator_id === o.id ? "selected" : ""}>${escapeHTML(o.full_name || o.id)}</option>`).join("")}</select>
            </div>
            <div style="display:flex;gap:10px;margin-top:10px;">
              <button type="button" class="btn btn-outline btn-block" id="cancelBtn">Cancel</button>
              <button type="submit" class="btn btn-primary btn-block" id="saveBtn">${match ? "Save Changes" : "Create Match"}</button>
            </div>
          </form>
        </div>
      </div>`;
    document.getElementById("cancelBtn").addEventListener("click", () => root.innerHTML = "");
    document.getElementById("matchModalOverlay").addEventListener("click", (e) => { if (e.target.id === "matchModalOverlay") root.innerHTML = ""; });
    document.getElementById("matchForm").addEventListener("submit", (e) => saveMatch(e, match));
  }

  async function saveMatch(e, existing) {
    e.preventDefault();
    const saveBtn = document.getElementById("saveBtn");
    setLoading(saveBtn, true, "Saving...");
    try {
      const teamA = document.getElementById("f_teamA").value;
      const teamB = document.getElementById("f_teamB").value;
      if (teamA === teamB) throw new Error("Team A and Team B must be different.");
      const payload = {
        tournament_id: document.getElementById("f_tournament").value || null,
        team_a_id: teamA,
        team_b_id: teamB,
        match_date: document.getElementById("f_date").value || null,
        match_time: document.getElementById("f_time").value || null,
        venue: document.getElementById("f_venue").value.trim(),
        overs_limit: Number(document.getElementById("f_overs").value) || 20,
        toss_winner_id: document.getElementById("f_toss_winner").value || null,
        toss_decision: document.getElementById("f_toss_decision").value || null,
        operator_id: document.getElementById("f_operator").value || null,
      };
      if (existing) {
        const { error } = await sb.from("matches").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("matches").insert(payload);
        if (error) throw error;
      }
      toast(existing ? "Match updated." : "Match created.", "success");
      document.getElementById("modalRoot").innerHTML = "";
      loadMatches();
    } catch (err) {
      showError(err, "save match");
    } finally {
      setLoading(saveBtn, false);
    }
  }

  document.getElementById("addMatchBtn")?.addEventListener("click", () => openModal(null));

  await loadRefs();
  await loadMatches();
})();

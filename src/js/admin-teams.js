(async function () {
  const shell = await initAdminShell({ active: "teams", requiredRole: "super_admin", title: "Manage Teams" });
  if (!shell) return;
  const sb = window.supabaseClient;
  const { contentEl } = shell;

  let tournaments = [];
  let teams = [];

  contentEl.innerHTML = `
    <div class="admin-topbar" style="margin-bottom:14px;">
      <div></div>
      <button class="btn btn-primary" id="addTeamBtn">➕ Add Team</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Logo</th><th>Team</th><th>Manager</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="teamsBody"><tr><td colspan="5" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
    <div id="modalRoot"></div>
  `;

  async function loadTournaments() {
    const { data } = await sb.from("tournaments").select("id,name").order("start_date", { ascending: false });
    tournaments = data || [];
  }

  async function loadTeams() {
    const { data, error } = await sb.from("teams").select("*, team_managers(*)").order("name");
    if (error) { showError(error, "load teams"); return; }
    teams = data || [];
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById("teamsBody");
    if (!teams.length) { tbody.innerHTML = `<tr><td colspan="5">${emptyStateHTML("No teams yet. Click 'Add Team' to create one.")}</td></tr>`; return; }
    tbody.innerHTML = teams.map(t => {
      const mgr = t.team_managers && t.team_managers[0];
      return `
      <tr>
        <td><div class="avatar-circle" style="width:40px;height:40px;font-size:0.7rem;">${t.logo_url ? `<img src="${t.logo_url}">` : initials(t.name)}</div></td>
        <td><strong>${escapeHTML(t.name)}</strong><br><span class="muted" style="font-size:0.78rem;">${escapeHTML(t.short_name || "")}</span></td>
        <td>${mgr ? escapeHTML(mgr.name) : '<span class="muted">Not set</span>'}</td>
        <td><span class="badge ${t.is_active ? 'badge-gold' : ''}">${t.is_active ? "Active" : "Inactive"}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" data-edit="${t.id}">Edit</button>
          <button class="btn btn-outline btn-sm" data-toggle="${t.id}">${t.is_active ? "Deactivate" : "Activate"}</button>
          <button class="btn btn-danger btn-sm" data-delete="${t.id}">Delete</button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openModal(teams.find(t => t.id === b.dataset.edit))));
    tbody.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deleteTeam(b.dataset.delete)));
    tbody.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => toggleActive(b.dataset.toggle)));
  }

  async function toggleActive(id) {
    const t = teams.find(x => x.id === id);
    const { error } = await sb.from("teams").update({ is_active: !t.is_active }).eq("id", id);
    if (error) return showError(error, "toggle team");
    toast(`Team ${t.is_active ? "deactivated" : "activated"}.`, "success");
    loadTeams();
  }

  async function deleteTeam(id) {
    const t = teams.find(x => x.id === id);
    if (!confirmAction(`Delete "${t.name}"? This also removes its players and manager. This cannot be undone.`)) return;
    const { error } = await sb.from("teams").delete().eq("id", id);
    if (error) return showError(error, "delete team");
    toast("Team deleted.", "success");
    loadTeams();
  }

  function openModal(team = null) {
    const mgr = team?.team_managers?.[0];
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-overlay" id="teamModalOverlay">
        <div class="modal-box">
          <h3>${team ? "Edit Team" : "Add Team"}</h3>
          <form id="teamForm">
            <div class="form-row">
              <div class="form-group"><label>Team Name *</label><input id="f_name" required value="${team ? escapeHTML(team.name) : ""}"></div>
              <div class="form-group"><label>Short Name</label><input id="f_short" maxlength="6" value="${team ? escapeHTML(team.short_name || "") : ""}"></div>
            </div>
            <div class="form-group">
              <label>Tournament</label>
              <select id="f_tournament">
                <option value="">— None —</option>
                ${tournaments.map(t => `<option value="${t.id}" ${team?.tournament_id === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group"><label>Team Logo</label><input type="file" id="f_logo" accept="image/*"></div>
            <hr style="border-color:var(--line);margin:16px 0;">
            <strong>Team Manager</strong>
            <div class="form-row" style="margin-top:10px;">
              <div class="form-group"><label>Manager Name</label><input id="f_mgr_name" value="${mgr ? escapeHTML(mgr.name) : ""}"></div>
              <div class="form-group"><label>Mobile</label><input id="f_mgr_mobile" value="${mgr ? escapeHTML(mgr.mobile || "") : ""}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Email</label><input type="email" id="f_mgr_email" value="${mgr ? escapeHTML(mgr.email || "") : ""}"></div>
              <div class="form-group"><label>Address</label><input id="f_mgr_address" value="${mgr ? escapeHTML(mgr.address || "") : ""}"></div>
            </div>
            <div style="display:flex;gap:10px;margin-top:10px;">
              <button type="button" class="btn btn-outline btn-block" id="cancelBtn">Cancel</button>
              <button type="submit" class="btn btn-primary btn-block" id="saveBtn">${team ? "Save Changes" : "Add Team"}</button>
            </div>
          </form>
        </div>
      </div>`;
    document.getElementById("cancelBtn").addEventListener("click", () => root.innerHTML = "");
    document.getElementById("teamModalOverlay").addEventListener("click", (e) => { if (e.target.id === "teamModalOverlay") root.innerHTML = ""; });
    document.getElementById("teamForm").addEventListener("submit", (e) => saveTeam(e, team));
  }

  async function uploadFile(bucket, file) {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveTeam(e, existing) {
    e.preventDefault();
    const saveBtn = document.getElementById("saveBtn");
    setLoading(saveBtn, true, "Saving...");
    try {
      const name = document.getElementById("f_name").value.trim();
      const short_name = document.getElementById("f_short").value.trim();
      const tournament_id = document.getElementById("f_tournament").value || null;
      const logoFile = document.getElementById("f_logo").files[0];
      let logo_url = existing?.logo_url || null;
      if (logoFile) logo_url = await uploadFile("team-logos", logoFile);

      let teamId = existing?.id;
      if (existing) {
        const { error } = await sb.from("teams").update({ name, short_name, tournament_id, logo_url }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("teams").insert({ name, short_name, tournament_id, logo_url }).select().single();
        if (error) throw error;
        teamId = data.id;
      }

      const mgrName = document.getElementById("f_mgr_name").value.trim();
      if (mgrName) {
        const mgrPayload = {
          team_id: teamId,
          name: mgrName,
          mobile: document.getElementById("f_mgr_mobile").value.trim(),
          email: document.getElementById("f_mgr_email").value.trim(),
          address: document.getElementById("f_mgr_address").value.trim(),
        };
        const { error } = await sb.from("team_managers").upsert(mgrPayload, { onConflict: "team_id" });
        if (error) throw error;
      }

      toast(existing ? "Team updated." : "Team added.", "success");
      document.getElementById("modalRoot").innerHTML = "";
      loadTeams();
    } catch (err) {
      showError(err, "save team");
    } finally {
      setLoading(saveBtn, false);
    }
  }

  document.getElementById("addTeamBtn").addEventListener("click", () => openModal(null));

  await loadTournaments();
  await loadTeams();
})();

(async function () {
  const shell = await initAdminShell({ active: "players", requiredRole: "super_admin", title: "Manage Players" });
  if (!shell) return;
  const sb = window.supabaseClient;
  const { contentEl } = shell;

  let teams = [];
  let players = [];
  let filterTeam = "";

  contentEl.innerHTML = `
    <div class="admin-topbar" style="margin-bottom:14px;">
      <select id="teamFilter" style="max-width:260px;"><option value="">All Teams</option></select>
      <button class="btn btn-primary" id="addPlayerBtn">➕ Add Player</button>
    </div>
    <p class="muted" id="squadHint"></p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Photo</th><th>Name</th><th>Team</th><th>#</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="playersBody"><tr><td colspan="7" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
    <div id="modalRoot"></div>
  `;

  async function loadTeams() {
    const { data } = await sb.from("teams").select("id,name").order("name");
    teams = data || [];
    const sel = document.getElementById("teamFilter");
    sel.innerHTML = `<option value="">All Teams</option>` + teams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("");
    sel.addEventListener("change", () => { filterTeam = sel.value; loadPlayers(); });
  }

  async function loadPlayers() {
    let q = sb.from("players").select("*, team:teams(name)").order("name");
    if (filterTeam) q = q.eq("team_id", filterTeam);
    const { data, error } = await q;
    if (error) return showError(error, "load players");
    players = data || [];
    renderTable();
    if (filterTeam) {
      document.getElementById("squadHint").textContent = `${players.length} / 20 players in squad (minimum recommended: 15).`;
    } else {
      document.getElementById("squadHint").textContent = "";
    }
  }

  function renderTable() {
    const tbody = document.getElementById("playersBody");
    if (!players.length) { tbody.innerHTML = `<tr><td colspan="7">${emptyStateHTML("No players found.")}</td></tr>`; return; }
    tbody.innerHTML = players.map(p => `
      <tr>
        <td><div class="avatar-circle" style="width:36px;height:36px;font-size:0.65rem;">${p.photo_url ? `<img src="${p.photo_url}">` : initials(p.name)}</div></td>
        <td><strong>${escapeHTML(p.name)}</strong></td>
        <td>${escapeHTML(p.team?.name || "-")}</td>
        <td>${p.jersey_number ?? "-"}</td>
        <td>${escapeHTML(p.role || "-")}</td>
        <td><span class="badge ${p.is_active ? 'badge-gold' : ''}">${p.is_active ? "Active" : "Inactive"}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" data-edit="${p.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${p.id}">Delete</button>
        </td>
      </tr>`).join("");
    tbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openModal(players.find(p => p.id === b.dataset.edit))));
    tbody.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deletePlayer(b.dataset.delete)));
  }

  async function deletePlayer(id) {
    const p = players.find(x => x.id === id);
    if (!confirmAction(`Delete player "${p.name}"? This cannot be undone.`)) return;
    const { error } = await sb.from("players").delete().eq("id", id);
    if (error) return showError(error, "delete player");
    toast("Player deleted.", "success");
    loadPlayers();
  }

  function openModal(player = null) {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-overlay" id="playerModalOverlay">
        <div class="modal-box">
          <h3>${player ? "Edit Player" : "Add Player"}</h3>
          <form id="playerForm">
            <div class="form-group"><label>Player Name *</label><input id="f_name" required value="${player ? escapeHTML(player.name) : ""}"></div>
            <div class="form-row">
              <div class="form-group"><label>Team *</label>
                <select id="f_team" required>
                  <option value="">Select team</option>
                  ${teams.map(t => `<option value="${t.id}" ${player?.team_id === t.id ? "selected" : ""}>${escapeHTML(t.name)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group"><label>Jersey Number</label><input type="number" min="0" id="f_jersey" value="${player?.jersey_number ?? ""}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Role</label>
                <select id="f_role">
                  ${["Batsman","Bowler","All-Rounder","Wicket Keeper"].map(r => `<option ${player?.role === r ? "selected" : ""}>${r}</option>`).join("")}
                </select>
              </div>
              <div class="form-group"><label>Status</label>
                <select id="f_status">
                  <option value="true" ${player?.is_active !== false ? "selected" : ""}>Active</option>
                  <option value="false" ${player?.is_active === false ? "selected" : ""}>Inactive</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Batting Style</label><input id="f_bat" value="${player ? escapeHTML(player.batting_style || "") : ""}" placeholder="e.g. Right-hand"></div>
              <div class="form-group"><label>Bowling Style</label><input id="f_bowl" value="${player ? escapeHTML(player.bowling_style || "") : ""}" placeholder="e.g. Right-arm fast"></div>
            </div>
            <div class="form-group"><label>Player Photo</label><input type="file" id="f_photo" accept="image/*"></div>
            <div style="display:flex;gap:10px;margin-top:10px;">
              <button type="button" class="btn btn-outline btn-block" id="cancelBtn">Cancel</button>
              <button type="submit" class="btn btn-primary btn-block" id="saveBtn">${player ? "Save Changes" : "Add Player"}</button>
            </div>
          </form>
        </div>
      </div>`;
    document.getElementById("cancelBtn").addEventListener("click", () => root.innerHTML = "");
    document.getElementById("playerModalOverlay").addEventListener("click", (e) => { if (e.target.id === "playerModalOverlay") root.innerHTML = ""; });
    document.getElementById("playerForm").addEventListener("submit", (e) => savePlayer(e, player));
  }

  async function uploadFile(bucket, file) {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function savePlayer(e, existing) {
    e.preventDefault();
    const saveBtn = document.getElementById("saveBtn");
    setLoading(saveBtn, true, "Saving...");
    try {
      const team_id = document.getElementById("f_team").value;
      if (!existing) {
        const { count } = await sb.from("players").select("*", { count: "exact", head: true }).eq("team_id", team_id);
        if ((count ?? 0) >= 20) throw new Error("This team already has the maximum of 20 players.");
      }
      const photoFile = document.getElementById("f_photo").files[0];
      let photo_url = existing?.photo_url || null;
      if (photoFile) photo_url = await uploadFile("player-photos", photoFile);

      const payload = {
        name: document.getElementById("f_name").value.trim(),
        team_id,
        jersey_number: document.getElementById("f_jersey").value ? Number(document.getElementById("f_jersey").value) : null,
        role: document.getElementById("f_role").value,
        batting_style: document.getElementById("f_bat").value.trim(),
        bowling_style: document.getElementById("f_bowl").value.trim(),
        is_active: document.getElementById("f_status").value === "true",
        photo_url,
      };

      if (existing) {
        const { error } = await sb.from("players").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("players").insert(payload);
        if (error) throw error;
      }
      toast(existing ? "Player updated." : "Player added.", "success");
      document.getElementById("modalRoot").innerHTML = "";
      loadPlayers();
    } catch (err) {
      showError(err, "save player");
    } finally {
      setLoading(saveBtn, false);
    }
  }

  document.getElementById("addPlayerBtn").addEventListener("click", () => openModal(null));

  await loadTeams();
  await loadPlayers();
})();

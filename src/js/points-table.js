(async function () {
  const sb = window.supabaseClient;
  const tbody = document.getElementById("pointsBody");

  async function load() {
    const { data, error } = await sb.from("points_table")
      .select("*, team:teams(name, short_name, logo_url)")
      .order("points", { ascending: false })
      .order("net_run_rate", { ascending: false });
    if (error) { tbody.innerHTML = `<tr><td colspan="8" class="muted">Could not load points table.</td></tr>`; return; }
    if (!data.length) { tbody.innerHTML = `<tr><td colspan="8" class="muted">No standings yet — matches haven't started.</td></tr>`; return; }
    tbody.innerHTML = data.map((row, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(row.team?.name || "Team")}</td>
        <td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td><td>${row.no_result}</td>
        <td><strong>${row.points}</strong></td>
        <td>${Number(row.net_run_rate).toFixed(3)}</td>
      </tr>`).join("");
  }

  await load();
  sb.channel("points-table-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "points_table" }, load)
    .subscribe();
})();

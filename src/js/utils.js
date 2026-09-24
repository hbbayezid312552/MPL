// ============================================================
// SHARED UTILITIES — used across every page
// ============================================================

// ---------- Toast notifications ----------
function toast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ---------- Friendly error messages (never leak raw DB errors) ----------
function friendlyError(error) {
  if (!error) return "Something went wrong. Please try again.";
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("duplicate") || msg.includes("unique")) return "That item already exists. Please use a different name/number.";
  if (msg.includes("network") || msg.includes("fetch")) return "Network problem — check your internet connection and try again.";
  if (msg.includes("jwt") || msg.includes("permission") || msg.includes("policy")) return "You don't have permission to do that. Please log in again.";
  if (msg.includes("more than 20")) return "This team already has the maximum of 20 players.";
  return "Something went wrong. Please try again, or contact the Super Admin.";
}

function showError(error, context = "") {
  console.error(context, error);
  toast(friendlyError(error), "error");
}

// ---------- Confirmation dialog ----------
function confirmAction(message) {
  return window.confirm(message);
}

// ---------- Loading state helper ----------
function setLoading(el, isLoading, loadingText = "Loading...") {
  if (!el) return;
  if (isLoading) {
    el.dataset.originalContent = el.innerHTML;
    el.innerHTML = `<span class="spinner"></span> ${loadingText}`;
    el.disabled = true;
  } else {
    if (el.dataset.originalContent) el.innerHTML = el.dataset.originalContent;
    el.disabled = false;
  }
}

// ---------- Empty state helper ----------
function emptyStateHTML(message, icon = "🏏") {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${message}</p></div>`;
}

// ---------- Formatting ----------
function formatOvers(balls) {
  const overs = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${overs}.${rem}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

// ---------- Auth guard for admin pages ----------
async function requireAuth(requiredRole = null) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "/admin/login.html";
    return null;
  }
  const { data: profile, error } = await window.supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    toast("Session invalid. Please log in again.", "error");
    await window.supabaseClient.auth.signOut();
    window.location.href = "/admin/login.html";
    return null;
  }
  if (requiredRole === "super_admin" && profile.role !== "super_admin") {
    toast("You don't have permission to view this page.", "error");
    window.location.href = "/admin/dashboard.html";
    return null;
  }
  return { session, profile };
}

// ---------- Nav active-link highlighting ----------
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav-link]").forEach(link => {
    if (link.getAttribute("href") === path) link.classList.add("active");
  });
});

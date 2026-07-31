/**
 * callApi - Makes an AJAX call to a Node API using Fetch API
 *
 * @param {string}      url    - The API endpoint URL
 * @param {string}      method - HTTP method: 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'
 * @param {object|null} data   - Request payload (for POST/PUT/PATCH), or null for GET/DELETE
 * @returns {Promise}          - Resolves with parsed response, throws on error
 */

// Coalesce concurrent refresh attempts so 5 simultaneous 401s don't fire
// 5 refresh calls — they all await the same in-flight promise.
let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}auth/refresh-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await res.json();
        if (data?.success) {
          localStorage.setItem("token", data.data.accessToken);
          return true;
        }
        // The account lapsed while this session was open — carry the reason
        // over the forceLogout() the caller is about to do, so the user lands
        // on the login screen with an explanation instead of a blank form.
        stashAuthNotice(data);
        return false;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function forceLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  sessionStorage.clear();
  // Full reload so AuthProvider resets to its logged-out state and App.jsx
  // shows the Login screen again — simplest, most reliable reset point.
  window.location.reload();
}

// ── session ended for a reason worth explaining ──────────────────────────────
// A staff member whose company let its subscription lapse gets a 403 on the
// next call. Kicking them to the login screen with no explanation reads as a
// bug ("it just logged me out"), so the reason is parked in localStorage —
// which forceLogout()'s reload preserves — and Login.jsx shows it once.
const AUTH_NOTICE_KEY = "authNotice";
const SESSION_ENDED_CODES = new Set(["SUBSCRIPTION_EXPIRED"]);

function stashAuthNotice(parsed) {
  if (parsed?.code && SESSION_ENDED_CODES.has(parsed.code) && parsed.message) {
    localStorage.setItem(AUTH_NOTICE_KEY, parsed.message);
  }
}

// Read-and-clear — the notice is for the next login screen only.
export function takeAuthNotice() {
  const notice = localStorage.getItem(AUTH_NOTICE_KEY);
  if (notice) localStorage.removeItem(AUTH_NOTICE_KEY);
  return notice || "";
}

// Any response carrying one of these codes means "this account needs to
// upgrade to do that" — surfaced centrally here (rather than each caller
// having to know about billing) so every screen gets the same upgrade
// dialog instead of whatever generic error text that form happens to show.
const UPGRADE_CODES = new Set(["UPGRADE_REQUIRED", "USER_LIMIT_REACHED", "ORG_LIMIT_REACHED", "SUBSCRIPTION_INACTIVE"]);
let upgradeRequiredHandler = null;
export function setUpgradeRequiredHandler(fn) {
  upgradeRequiredHandler = fn;
}
// Exported so call sites that can't go through callAPI (e.g. WhatsAppSender's
// raw fetch() for multipart uploads) can still trigger the same dialog.
export function notifyUpgradeRequired(parsed) {
  if (parsed?.code && UPGRADE_CODES.has(parsed.code) && upgradeRequiredHandler) {
    upgradeRequiredHandler(parsed);
  }
}

// ── global loading indicator ─────────────────────────────────────────────────
// Every in-flight callAPI bumps a counter; <GlobalLoader/> subscribes and shows
// the overlay while the counter is > 0. Same registration pattern as the
// upgrade handler above — this module stays framework-agnostic and the React
// side just listens.
let pendingCount = 0;
let loadingListener = null;
let showTimer = null;
let hideTimer = null;
let loaderVisible = false;
let shownAt = 0;

// Most calls finish well under this, and flashing a full-screen dim for a
// 90ms lookup is worse than showing nothing — so only requests that actually
// keep the user waiting flip the overlay on.
const SHOW_DELAY_MS = 250;

// Screens that load several things do it sequentially — Dashboard, for one:
//   await callAPI("dashboard/stats");
//   await callAPI("dashboard/recent-transactions");
//   await callAPI("dashboard/low-stock");
// so pendingCount legitimately hits 0 in the gap between each pair. Hiding on
// that would blink the overlay once per request. Instead we wait out this grace
// period; the next call in the chain (gaps here are single-digit ms, even with
// a React re-render in between) cancels the pending hide and the user sees one
// continuous loader from the first request to the last.
const HIDE_GRACE_MS = 200;

// Once it's actually on screen, keep it there long enough to register as a
// loader rather than a glitch — otherwise a chain whose last call returns
// instantly rips it away the moment it appeared.
const MIN_VISIBLE_MS = 350;

function emitLoading(next) {
  if (loaderVisible === next) return;
  loaderVisible = next;
  if (next) shownAt = Date.now();
  loadingListener?.(next);
}

export function subscribeLoading(fn) {
  loadingListener = fn;
  fn(loaderVisible); // sync the subscriber with any call already in flight
  return () => { if (loadingListener === fn) loadingListener = null; };
}

// Exported so call sites that can't go through callAPI (e.g. WhatsAppSender's
// raw fetch() for multipart uploads) can still drive the same overlay.
// Always pair them — endRequest() belongs in a finally block.
export function beginRequest() {
  pendingCount++;

  // Cancel any hide waiting out its grace period: this request continues the
  // same burst, so the overlay stays up untouched — no blink, and no second
  // SHOW_DELAY wait before it comes back.
  clearTimeout(hideTimer);
  hideTimer = null;

  if (!loaderVisible && !showTimer) {
    showTimer = setTimeout(() => {
      showTimer = null;
      if (pendingCount > 0) emitLoading(true);
    }, SHOW_DELAY_MS);
  }
}

export function endRequest() {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount > 0 || hideTimer) return; // other calls still running

  const minLeft = loaderVisible ? MIN_VISIBLE_MS - (Date.now() - shownAt) : 0;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (pendingCount > 0) return; // a new call landed — leave the overlay up
    clearTimeout(showTimer);
    showTimer = null;
    emitLoading(false);
  }, Math.max(HIDE_GRACE_MS, minLeft));
}

/**
 * Holds the loader across an entire block, so a multi-step flow shows one
 * overlay even where the gaps between its calls outrun HIDE_GRACE_MS (heavy
 * rendering or client-side work between requests, a confirm step, etc.).
 *
 *   await withLoader(async () => {
 *     const a = await callAPI("...", "GET");
 *     buildSomethingExpensive(a);
 *     await callAPI("...", "GET");
 *   });
 */
export async function withLoader(fn) {
  beginRequest();
  try {
    return await fn();
  } finally {
    endRequest();
  }
}

/**
 * @param {boolean} silent - skip the global loader for this call. Use for
 *   background work the user didn't ask for (polling, prefetch, autosave)
 *   where dimming the screen would interrupt them mid-typing.
 */
export async function callAPI(url, method, data = null, _isRetry = false, timeout = 60000, silent = false) {
  if (!silent) beginRequest();
  try {
    return await sendRequest(url, method, data, _isRetry, timeout, silent);
  } finally {
    if (!silent) endRequest();
  }
}

async function sendRequest(url, method, data, _isRetry, timeout, silent) {
  const fullUrl = `${import.meta.env.VITE_API_URL}${url}`;
  const token = localStorage.getItem("token");

  const methodsWithBody = ["POST", "PUT", "PATCH"];
  const hasBody = methodsWithBody.includes(method.toUpperCase()) && data;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout); // default 60 seconds

  try {
    const res = await fetch(fullUrl, {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(token && { "Authorization": `Bearer ${token}` }),
      },
      body: hasBody ? JSON.stringify(data) : null,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Access token expired mid-session — try one silent refresh, then
    // replay the original call. Skip this dance for the auth endpoints
    // themselves to avoid an infinite loop.
    const isAuthEndpoint = url.startsWith("auth/");
    if (res.status === 401 && !_isRetry && !isAuthEndpoint) {
      const refreshed = await refreshAccessToken();
      // Recurse into sendRequest, not callAPI — the loader count is already
      // held by the outer callAPI, so the replay stays under one indicator
      // instead of blinking off between the two attempts.
      if (refreshed) return sendRequest(url, method, data, true, timeout, silent);
      forceLogout();
      return { success: false, message: "Session expired" };
    }

    const text = await res.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }

    if (res.status === 402) notifyUpgradeRequired(parsed);

    // Subscription lapsed → this session is over. Skipped for the login/signup
    // forms themselves: there's no session to end there, and reloading would
    // wipe the message the user needs to read before they can act on it.
    const isAuthEntryPoint = url === "auth/login" || url === "auth/signup";
    if (res.status === 403 && !isAuthEntryPoint && SESSION_ENDED_CODES.has(parsed?.code)) {
      stashAuthNotice(parsed);
      forceLogout();
    }

    return parsed;

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError")
      throw new Error("Request timed out.");
    throw err;
  }
}

const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "").replace(/\/$/, "");
 
export function resolveAssetUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}
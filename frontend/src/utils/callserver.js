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

export async function callAPI(url, method, data = null, _isRetry = false) {
  const fullUrl = `${import.meta.env.VITE_API_URL}${url}`;
  const token = localStorage.getItem("token");

  const methodsWithBody = ["POST", "PUT", "PATCH"];
  const hasBody = methodsWithBody.includes(method.toUpperCase()) && data;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

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
      if (refreshed) return callAPI(url, method, data, true);
      forceLogout();
      return { success: false, message: "Session expired" };
    }

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }

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
/**
 * callApi - Makes an AJAX call to a Node API using Fetch API
 *
 * @param {string}      url    - The API endpoint URL
 * @param {string}      method - HTTP method: 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'
 * @param {object|null} data   - Request payload (for POST/PUT/PATCH), or null for GET/DELETE
 * @returns {Promise}          - Resolves with parsed response, throws on error
 */
export async function callAPI(url, method, data = null) {
  const fullUrl = `http://localhost:5000/api/${url}`;
  const token   = sessionStorage.getItem("token");

  const methodsWithBody = ["POST", "PUT", "PATCH"];
  const hasBody         = methodsWithBody.includes(method.toUpperCase()) && data;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10000); // 10 seconds

  try {
    const res = await fetch(fullUrl, {
      method:  method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        "Accept":        "application/json",
        ...(token && { "Authorization": `Bearer ${token}` }),
      },
      body:   hasBody ? JSON.stringify(data) : null,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Request failed [${res.status}]: ${res.statusText}`);
    }

    const text = await res.text();

    try {
      const parsed = JSON.parse(text);
      return parsed;
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
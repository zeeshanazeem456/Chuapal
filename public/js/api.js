// ─────────────────────────────────────────────────────────────
// api.js: the ONE place the frontend talks to the backend.
// Every page calls api("/polls") instead of writing fetch() by hand.
// ─────────────────────────────────────────────────────────────
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin", // send our login cookie along
  });

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON response */ }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

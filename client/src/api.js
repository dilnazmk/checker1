export async function api(path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  if (response.status === 204) return {};
  const result = await response.json().catch(() => ({ error: 'The server returned an invalid response.' }));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    throw new Error(result.error || 'The request could not be completed.');
  }
  return result;
}

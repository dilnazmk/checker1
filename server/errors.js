export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function requiredText(value, label, max = 250) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    fail(400, `${label} is required and must be at most ${max} characters.`);
  }
  return value.trim();
}

export function numericId(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) fail(400, 'Invalid id.');
  return Number(value);
}

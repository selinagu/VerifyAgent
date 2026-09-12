const SENSITIVE_KEY = /(authorization|api.?key|secret|token|cookie|password|requesttext|payload|confirmation.?hash|scope.?hash|reference.?id|inquiry.?id)/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(entry),
  ]));
}

/**
 * Parse a duration string like "30d", "12h", "45m", "10s", "2w" into milliseconds.
 * Returns null if the input is invalid.
 */
export function parseDuration(input: string): number | null {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(input.trim());
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]!.toLowerCase()) {
    case 's': return n * 1000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    case 'w': return n * 7 * 86_400_000;
  }
  return null;
}

export function expiresAtFromTtl(ttl: string | undefined, now = Date.now()): number | null {
  if (!ttl) return null;
  const ms = parseDuration(ttl);
  return ms === null ? null : now + ms;
}

export function sinceFromAgo(ago: string | undefined, now = Date.now()): number | undefined {
  if (!ago) return undefined;
  const ms = parseDuration(ago);
  return ms === null ? undefined : now - ms;
}

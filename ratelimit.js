// Simple per-IP fixed-window limiter. Per serverless instance (best effort);
// for strict global limits use Vercel KV / Upstash Redis.
const hits = new Map();
export const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 10);
export function rateLimited(ip, now = Date.now()) {
  const w = Math.floor(now / 60000);
  const k = `${ip}:${w}`;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(`:${w}`)) hits.delete(key);
  return n > LIMIT;
}

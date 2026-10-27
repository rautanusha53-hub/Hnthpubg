// GamingServiceNP player lookup.
// Uses the same request the GSN PUBG top-up page makes when you type a Player ID:
//   1. GET the product page -> session cookies + CSRF token + topUpId
//   2. POST /direct-topup/lookup-account  { topUpId, userid, zoneid }
// Success only when GSN answers {status:"success", data:{nickname}} for THIS uid.

const BASE = "https://www.gamingservicenp.com";
const PAGE = `${BASE}/direct-topup/details/pubg-mobile`;
const LOOKUP = `${BASE}/direct-topup/lookup-account`;
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";
export const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 12000);

export class UpstreamError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function isValidUid(uid) {
  return typeof uid === "string" && /^[0-9]{5,15}$/.test(uid);
}

function cookiesFrom(res) {
  const list = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") || "").split(/,(?=\s*[^;,=\s]+=)/);
  return list.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

async function timed(fetchImpl, url, opts, deadline) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1, deadline - Date.now()));
  try {
    return await fetchImpl(url, { ...opts, signal: ctrl.signal, redirect: "manual" });
  } catch (e) {
    if (e.name === "AbortError") throw new UpstreamError("timeout", "GamingServiceNP did not respond in time", 504);
    throw new UpstreamError("network", "Could not reach GamingServiceNP", 502);
  } finally { clearTimeout(t); }
}

export async function lookupNickname(uid, fetchImpl = fetch) {
  const deadline = Date.now() + TIMEOUT_MS;

  const page = await timed(fetchImpl, PAGE, { headers: { "User-Agent": UA, Accept: "text/html" } }, deadline);
  if (page.status !== 200) throw new UpstreamError("unavailable", `GamingServiceNP page returned HTTP ${page.status}`, 503);
  const html = await page.text();
  const csrf = html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const topUpId = html.match(/var\s+topUpId\s*=\s*["']?(\d+)/)?.[1];
  if (!csrf || !topUpId) throw new UpstreamError("changed", "GamingServiceNP page format changed; lookup unavailable", 503);

  const res = await timed(fetchImpl, LOOKUP, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
      "X-CSRF-TOKEN": csrf,
      "X-Requested-With": "XMLHttpRequest",
      Origin: BASE,
      Referer: PAGE,
      Cookie: cookiesFrom(page),
    },
    body: new URLSearchParams({ topUpId, userid: uid, zoneid: "" }).toString(),
  }, deadline);

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (res.status === 429) throw new UpstreamError("rate_limited", "GamingServiceNP is rate limiting requests, try again shortly", 503);
  if (!data || typeof data !== "object") throw new UpstreamError("malformed", `GamingServiceNP returned an unexpected response (HTTP ${res.status})`, 502);
  if (data.status === "unavailable") throw new UpstreamError("unavailable", "GamingServiceNP name checker is temporarily unavailable", 503);
  if (res.status === 422 || data.status === "error") {
    throw new UpstreamError("not_found", data.message || "Invalid Player ID", 404);
  }
  if (res.status >= 500) throw new UpstreamError("unavailable", `GamingServiceNP error HTTP ${res.status}`, 503);

  const nick = data?.data?.nickname;
  if (res.status !== 200 || data.status !== "success" || typeof nick !== "string" || !nick.trim() || nick.trim() === "-") {
    throw new UpstreamError("malformed", "GamingServiceNP did not return a nickname", 502);
  }
  return nick.trim();
}

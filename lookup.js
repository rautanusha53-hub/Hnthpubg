import { isValidUid, lookupNickname, UpstreamError } from "../../lib/gsn.js";
import { rateLimited } from "../../lib/ratelimit.js";

function fail(res, status, uid, error, code) {
  return res.status(status).json({ success: false, uid: uid ?? null, nickname: null, error, code });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, null, "Use POST", "method_not_allowed");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const raw = body?.uid;
  const uid = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : raw;
  if (!isValidUid(uid)) return fail(res, 400, typeof uid === "string" ? uid : null, "UID must be 5-15 digits", "invalid_uid");

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return fail(res, 429, uid, "Too many requests, wait a minute", "rate_limited");

  try {
    const nickname = await lookupNickname(uid);
    return res.status(200).json({ success: true, uid, nickname, source: "gamingservicenp" });
  } catch (e) {
    if (e instanceof UpstreamError) return fail(res, e.status, uid, e.message, e.code);
    console.error(e);
    return fail(res, 500, uid, "Unable to retrieve player nickname", "internal");
  }
}

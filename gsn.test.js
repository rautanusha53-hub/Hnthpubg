import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidUid, lookupNickname, UpstreamError } from "../lib/gsn.js";
import handler from "../api/pubg/lookup.js";

const PAGE_HTML = '<meta name="csrf-token" content="tok123"><script>var topUpId = "34"</script>';
const resp = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const fakeFetch = (lookupStatus, lookupBody) => async (url, opts) => {
  if (url.endsWith("/pubg-mobile")) return resp(200, PAGE_HTML, { "set-cookie": "gsn_session=abc; path=/" });
  assert.equal(opts.headers["X-CSRF-TOKEN"], "tok123");
  assert.match(opts.body, /userid=51460787300/);
  return resp(lookupStatus, lookupBody, { "content-type": "application/json" });
};

function runHandler(body) {
  return new Promise((resolve) => {
    const res = { code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, json: j }); }, end() { resolve({ code: this.code }); } };
    handler({ method: "POST", headers: {}, body }, res);
  });
}

test("valid-format UID passes validation", () => {
  assert.equal(isValidUid("51460787300"), true);
});

test("invalid UIDs are rejected without calling upstream", async () => {
  for (const bad of ["", "abc", "12a45", "123", "1234567890123456", "-5146078730"]) assert.equal(isValidUid(bad), false, bad);
  const r = await runHandler({ uid: "12ab" });
  assert.equal(r.code, 400);
  assert.equal(r.json.success, false);
  assert.equal(r.json.nickname, null);
});

test("returns the nickname GSN provides for this UID", async () => {
  assert.equal(await lookupNickname("51460787300", fakeFetch(200, { status: "success", data: { nickname: "BIRENDRA244" } })), "BIRENDRA244");
});

test("unknown player -> not_found error, never success", async () => {
  await assert.rejects(lookupNickname("51460787300", fakeFetch(422, { status: "error", message: "Invalid Player ID / Wrong User ID" })), (e) => e.code === "not_found");
});

test("upstream blocked / unavailable -> honest errors", async () => {
  const down = async () => resp(503, "<html>maintenance</html>");
  await assert.rejects(lookupNickname("51460787300", down), (e) => e instanceof UpstreamError && e.code === "unavailable");
  await assert.rejects(lookupNickname("51460787300", fakeFetch(200, { status: "unavailable", retry_after_seconds: 5 })), (e) => e.code === "unavailable");
  await assert.rejects(lookupNickname("51460787300", async () => { throw new TypeError("fetch failed"); }), (e) => e.code === "network");
  const forbidden = async () => resp(403, "Forbidden");
  await assert.rejects(lookupNickname("51460787300", forbidden), (e) => e.code === "unavailable");
});

test("page loaded but no nickname -> never reported as success (no fake names)", async () => {
  for (const body of [{ status: "success", data: {} }, { status: "success", data: { nickname: "" } }, { status: "success", data: { nickname: "-" } }, { status: "success" }, "<html>ok</html>"]) {
    await assert.rejects(lookupNickname("51460787300", fakeFetch(200, body)), UpstreamError);
  }
});

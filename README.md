# HNTH PUBG UID Lookup API

PUBG Mobile UID → nickname, verified through **GamingServiceNP** (no Midasbuy, no mock data).

## How it works (investigated 27 Oct 2026)

The GSN PUBG page (`/direct-topup/details/pubg-mobile`) checks the Player ID with its own call:

```
POST https://www.gamingservicenp.com/direct-topup/lookup-account
Headers: X-CSRF-TOKEN (from page <meta>), session cookies
Body (form): topUpId=34&userid=<UID>&zoneid=
→ 200 {"status":"success","data":{"nickname":"BIRENDRA244",...}}
→ 422 {"status":"error","message":"Invalid Player ID / Wrong User ID"}
→ {"status":"unavailable","retry_after_seconds":N}
```

This API repeats that exact flow server-side: load the page (cookies + CSRF + topUpId), then POST the lookup.
It is **not a documented public API**. GSN may change or block it at any time; when that happens this API returns an honest error (`changed`, `unavailable`, `rate_limited`) — never a fake name.
No browser automation is needed. Ask GSN for permission before heavy/commercial use.

## Endpoint

`POST /api/pubg/lookup`  · Header `Content-Type: application/json`

```json
{ "uid": "51460787300" }
```

Success (200):
```json
{ "success": true, "uid": "51460787300", "nickname": "BIRENDRA244", "source": "gamingservicenp" }
```

Failure:
```json
{ "success": false, "uid": "51460787300", "nickname": null, "error": "Invalid Player ID / Wrong User ID", "code": "not_found" }
```

| HTTP | code | meaning |
|---|---|---|
| 400 | invalid_uid | UID not 5–15 digits |
| 404 | not_found | GSN says the player doesn't exist |
| 429 | rate_limited | over 10 req/min per IP (this API) |
| 503 | unavailable / rate_limited / changed | GSN checker down, throttling, or page changed |
| 504 | timeout | GSN didn't answer within 12s |
| 502 | network / malformed | GSN unreachable or returned no nickname |

CORS is open (`*`) with an `OPTIONS` handler, so you can call it from any site — no CORS-proxy needed. The included website calls it same-origin.

## Deploy on Vercel via GitHub

1. Unzip, then create a new GitHub repo and push these files (or upload them via GitHub "Add file → Upload files").
2. vercel.com → **Add New → Project** → import the repo. Framework preset: **Other**. No build command. Deploy.
3. Your URLs:
   - Website: `https://<project>.vercel.app/`
   - API: `https://<project>.vercel.app/api/pubg/lookup`
   (Shown under the project's **Domains** in Vercel.)

Optional environment variables (Vercel → Settings → Environment Variables):
- `UPSTREAM_TIMEOUT_MS` (default 12000)
- `RATE_LIMIT_PER_MIN` (default 10). Limiter is per serverless instance; use Upstash/Vercel KV for strict global limits.

No secrets are required.

## Test it

```bash
# valid
curl -X POST https://<project>.vercel.app/api/pubg/lookup -H "Content-Type: application/json" -d '{"uid":"51460787300"}'
# invalid
curl -X POST https://<project>.vercel.app/api/pubg/lookup -H "Content-Type: application/json" -d '{"uid":"12ab"}'
```

Unit tests (Node 18+): `npm test` — covers valid format, invalid UID, upstream blocked/unavailable/network failure, and that a missing/empty nickname can never be returned as success.

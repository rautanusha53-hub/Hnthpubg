# HNTH PUBG UID Lookup API

Python FastAPI + Vercel starter with a responsive dark gaming UI. The project is configured to use **GamingServiceNP only**; it does not fall back to Midasbuy and never returns a made-up nickname.

## Important upstream status

The project does **not** assume that `https://www.gamingservicenp.com/direct-topup/details/pubg-mobile` is an API endpoint. The lookup URL is intentionally blank until you confirm a documented/authorized endpoint and its request/response schema. With no verified endpoint configured, the API returns `503 LOOKUP_UNAVAILABLE` and `nickname: null`. This is an honest failure state, not a working live nickname lookup.

The integration adapter currently expects a configured endpoint to accept `POST` JSON `{"uid":"..."}` and return JSON with an explicit `success: true` or `verified: true`, a non-empty `nickname` (or `nickName`), and a matching `uid`, `player_id`, or `id`. Change this adapter only to match a real, authorized contract; do not guess endpoints or bypass site protections.

## Project files

- `index.html`, `style.css`, `script.js` — frontend.
- `api/index.py` — FastAPI app and API routes.
- `requirements.txt` — Python dependencies.
- `vercel.json` — Vercel routing.
- `tests/test_api.py` — automated tests.
- `.env.example` — safe environment variable template.

## Run locally

Python 3.12 recommended.

```bash
python -m venv .venv
# Linux/macOS/Termux:
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt pytest
uvicorn api.index:app --reload
```

Open `http://127.0.0.1:8000` for the API JSON root; the static `index.html` can be previewed with a local static server from the project root, for example `python -m http.server 8000` (use a different port if Uvicorn is running). For the complete same-origin local setup, serve the frontend and proxy `/api` to Uvicorn, or test the API directly at `http://127.0.0.1:8000/docs`.

Run tests:

```bash
pip install pytest
pytest -q
```

## Deploy using GitHub + Vercel

1. Extract the ZIP.
2. Create a new GitHub repository.
3. Upload the **contents** of the project folder to the repository root (including `api/`, `index.html`, `vercel.json`, and `requirements.txt`).
4. In Vercel, choose **Add New → Project**, import that GitHub repository, and deploy using the default Python detection/configuration.
5. After deployment, copy the assigned domain, for example `https://your-project-name.vercel.app`.
6. Test `https://YOUR-DOMAIN/health`, `https://YOUR-DOMAIN/docs`, and the POST endpoint below.
7. If using a separate frontend origin, add its exact origin to `ALLOWED_ORIGINS` in Vercel Project Settings → Environment Variables, then redeploy.

Do not upload `.env` or secrets to GitHub. `.env.example` is safe to commit.

## API

`POST https://YOUR-DOMAIN/api/pubg/lookup`

Headers: `Content-Type: application/json`

```json
{"uid":"51460787300"}
```

Example success shape (only when the upstream really verifies the nickname):

```json
{"success":true,"uid":"51460787300","nickname":"ACTUAL_VERIFIED_NICKNAME","source":"gamingservicenp"}
```

Example current unavailable response when no authorized endpoint is configured:

```json
{"success":false,"uid":"51460787300","nickname":null,"source":"gamingservicenp","error":"GamingServiceNP nickname verification is not configured or currently unavailable.","code":"LOOKUP_UNAVAILABLE"}
```

Test with curl:

```bash
curl -i -X POST 'https://YOUR-DOMAIN/api/pubg/lookup' \
  -H 'Content-Type: application/json' \
  -d '{"uid":"51460787300"}'
```

Invalid UID test:

```bash
curl -i -X POST 'https://YOUR-DOMAIN/api/pubg/lookup' \
  -H 'Content-Type: application/json' \
  -d '{"uid":"not-a-uid"}'
```

## Configuration

Set these under Vercel → Project → Settings → Environment Variables:

- `GAMINGSERVICENP_LOOKUP_URL`: leave blank unless you have confirmed a legitimate endpoint and schema.
- `UPSTREAM_TIMEOUT_SECONDS`: timeout, default 10.
- `ALLOWED_ORIGINS`: comma-separated exact browser origins, e.g. `https://your-project-name.vercel.app`.
- `RATE_LIMIT_REQUESTS`: default 20 per window per function instance.
- `RATE_LIMIT_WINDOW_SECONDS`: default 60.

The included in-memory limiter is best-effort per serverless instance, not global protection. Use a shared rate-limit service for production-wide limits. CORS only controls browsers; it is not authentication.

## Troubleshooting

- `404`: confirm `api/index.py`, `vercel.json`, and repository root layout.
- `405`: use `POST` for lookup; health uses `GET`.
- `422`: UID must be a string of 5–20 digits.
- `429`: rate limit reached.
- `502`: upstream error or invalid/unverified response.
- `503`: no configured authorized lookup endpoint or upstream unavailable.
- `504`: upstream timed out.
- Browser CORS error: configure the exact frontend origin in `ALLOWED_ORIGINS`, redeploy, and check the preflight response. Do not use a public CORS proxy.

## Verification status

This package is prepared for deployment, but it has not been deployed to your Vercel account. A live nickname lookup cannot be truthfully claimed until GamingServiceNP's authorized verification mechanism is confirmed and configured. Automated tests cover validation, health, CORS preflight, and the no-fabricated-result behavior.

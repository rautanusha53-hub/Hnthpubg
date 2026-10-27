"""HNTH PUBG UID Lookup API - Vercel-compatible FastAPI application."""
from __future__ import annotations

import os
import re
import time
from collections import defaultdict, deque
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

APP_NAME = "HNTH PUBG UID Lookup API"
SOURCE = "gamingservicenp"
UPSTREAM_URL = os.getenv("GAMINGSERVICENP_LOOKUP_URL", "").strip()
TIMEOUT_SECONDS = max(1.0, min(float(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "10")), 30.0))
RATE_LIMIT_REQUESTS = max(1, int(os.getenv("RATE_LIMIT_REQUESTS", "20")))
RATE_LIMIT_WINDOW = max(1, int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")))
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if x.strip()]

app = FastAPI(title=APP_NAME, version="1.0.0", description="UID lookup API using only an authorized GamingServiceNP integration.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Best-effort per-instance protection. Use a shared store for global/serverless rate limiting.
_rate_buckets: dict[str, deque[float]] = defaultdict(deque)

class LookupRequest(BaseModel):
    uid: str = Field(..., min_length=5, max_length=20)

    @field_validator("uid", mode="before")
    @classmethod
    def validate_uid(cls, value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("UID must be a numeric string")
        value = value.strip()
        if not re.fullmatch(r"[0-9]{5,20}", value):
            raise ValueError("UID must contain 5 to 20 digits")
        return value


def error_body(uid: str | None, message: str, code: str) -> dict[str, Any]:
    return {"success": False, "uid": uid, "nickname": None, "source": SOURCE, "error": message, "code": code}

@app.middleware("http")
async def basic_rate_limit(request: Request, call_next):
    if request.url.path == "/api/pubg/lookup" and request.method == "POST":
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = _rate_buckets[client_ip]
        while bucket and now - bucket[0] >= RATE_LIMIT_WINDOW:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_REQUESTS:
            return JSONResponse(error_body(None, "Too many requests. Please try again later.", "RATE_LIMITED"), status_code=429)
        bucket.append(now)
    return await call_next(request)

@app.get("/")
async def root():
    return {"name": APP_NAME, "status": "running", "docs": "/docs", "lookup_endpoint": "/api/pubg/lookup"}

@app.get("/health")
@app.get("/api/health")
async def health():
    return {"success": True, "status": "running", "lookup_configured": bool(UPSTREAM_URL), "source": SOURCE}

@app.post("/api/pubg/lookup")
async def lookup_player(payload: LookupRequest):
    uid = payload.uid
    if not UPSTREAM_URL:
        return JSONResponse(
            error_body(uid, "GamingServiceNP nickname verification is not configured or currently unavailable.", "LOOKUP_UNAVAILABLE"),
            status_code=503,
        )

    # Intentionally no guessed request schema: only use a verified, documented/authorized endpoint.
    # Configure GAMINGSERVICENP_LOOKUP_URL only after confirming its request/response contract.
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = await client.post(UPSTREAM_URL, json={"uid": uid}, headers={"Accept": "application/json"})
        if response.status_code in (401, 403, 404, 405, 429):
            return JSONResponse(error_body(uid, "GamingServiceNP lookup is unavailable or access was denied.", "UPSTREAM_UNAVAILABLE"), status_code=502)
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError:
            return JSONResponse(error_body(uid, "The upstream returned an invalid response.", "INVALID_UPSTREAM_RESPONSE"), status_code=502)
        if not isinstance(data, dict):
            return JSONResponse(error_body(uid, "The upstream returned an invalid response.", "INVALID_UPSTREAM_RESPONSE"), status_code=502)
        # Require an explicit successful verification, a non-empty nickname, and matching UID.
        nickname = data.get("nickname") or data.get("nickName")
        returned_uid = data.get("uid") or data.get("player_id") or data.get("id")
        verified = data.get("success") is True or data.get("verified") is True
        if not verified or not isinstance(nickname, str) or not nickname.strip() or str(returned_uid or "") != uid:
            return JSONResponse(error_body(uid, "Unable to verify the nickname for this UID.", "VERIFICATION_FAILED"), status_code=502)
        return {"success": True, "uid": uid, "nickname": nickname.strip(), "source": SOURCE}
    except httpx.TimeoutException:
        return JSONResponse(error_body(uid, "GamingServiceNP lookup timed out.", "UPSTREAM_TIMEOUT"), status_code=504)
    except httpx.HTTPStatusError:
        return JSONResponse(error_body(uid, "GamingServiceNP returned an unsuccessful response.", "UPSTREAM_ERROR"), status_code=502)
    except httpx.RequestError:
        return JSONResponse(error_body(uid, "GamingServiceNP could not be reached.", "UPSTREAM_UNAVAILABLE"), status_code=503)

@app.exception_handler(Exception)
async def safe_unexpected_error(request: Request, exc: Exception):
    return JSONResponse(error_body(None, "An unexpected server error occurred.", "INTERNAL_ERROR"), status_code=500)

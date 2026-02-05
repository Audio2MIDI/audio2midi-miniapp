"""Audio2MIDI Mini App — Backend API."""

import re
import time
import base64
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Depends, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from auth import validate_init_data
from config import ADMIN_IDS, ACTION_LOG_PATH, MIDI_DIR, CORS_ORIGINS, CACHE_TTL_SECONDS

# Directory for persistent MIDI storage (for mini app linking)
MINIAPP_MIDI_DIR = Path("/home/jatana/Audio2MIDI/miniapp_midi")

app = FastAPI(title="Audio2MIDI Mini App API", version="1.0.0")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,  # use configured origins; add ngrok URL when ready
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Cache for conversions ---
_conversions_cache: dict = {"data": None, "ts": 0}


# --- Models ---
class AuthRequest(BaseModel):
    initData: str


class AuthResponse(BaseModel):
    ok: bool
    user: dict | None = None
    is_admin: bool = False
    error: str | None = None


class Conversion(BaseModel):
    user_id: str
    username: str
    text: str
    date: str
    action: str
    method: str


# --- Helpers ---
def parse_log_line(line: str) -> Optional[dict]:
    """Parse a single log line into a dict."""
    # Format: user: 371331803, username: @vosatorp, text: Numb, date: 2024-11-03 23:38:14, action: recognize_notes, note_recognition_choice: sheetsage
    pattern = (
        r"user:\s*(?P<user_id>-?\d+),\s*"
        r"username:\s*(?P<username>\S+),\s*"
        r"text:\s*(?P<text>.+?),\s*"
        r"date:\s*(?P<date>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}),\s*"
        r"action:\s*(?P<action>\S+),\s*"
        r"note_recognition_choice:\s*(?P<method>\S+)"
    )
    m = re.match(pattern, line.strip())
    if not m:
        return None
    return m.groupdict()


def load_conversions(user_id: int | None = None) -> list[dict]:
    """Load and optionally filter conversions from log file. Cached for 5 min."""
    now = time.time()

    # Check cache
    if _conversions_cache["data"] is not None and (now - _conversions_cache["ts"]) < CACHE_TTL_SECONDS:
        all_data = _conversions_cache["data"]
    else:
        all_data = []
        log_path = Path(ACTION_LOG_PATH)
        if log_path.exists():
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    parsed = parse_log_line(line)
                    if parsed:
                        all_data.append(parsed)
        _conversions_cache["data"] = all_data
        _conversions_cache["ts"] = now

    if user_id is not None:
        return [c for c in all_data if c["user_id"] == str(user_id)]
    return all_data


def extract_user_from_header(authorization: str | None) -> dict | None:
    """Validate initData from Authorization header."""
    if not authorization:
        return None
    # Expect: "tma <initData>"
    if authorization.startswith("tma "):
        init_data = authorization[4:]
    else:
        init_data = authorization
    result = validate_init_data(init_data)
    if result and result.get("user"):
        return result["user"]
    return None


# --- Endpoints ---

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/auth", response_model=AuthResponse)
async def auth(req: AuthRequest):
    """Validate Telegram initData and return user info."""
    result = validate_init_data(req.initData)
    if result is None:
        return AuthResponse(ok=False, error="Invalid initData signature")

    user = result.get("user", {})
    user_id = user.get("id")
    is_admin = user_id in ADMIN_IDS if user_id else False

    return AuthResponse(ok=True, user=user, is_admin=is_admin)


@app.get("/api/conversions")
async def get_conversions(
    user_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    authorization: str | None = Header(None),
):
    """
    Get conversion history.
    - Admins: can query any user_id or get all
    - Non-admins: only their own conversions
    """
    caller = extract_user_from_header(authorization)

    # If no auth, require at least admin check disabled for health-check scenarios
    caller_id = caller.get("id") if caller else None
    is_admin = caller_id in ADMIN_IDS if caller_id else False

    # Non-admin: force own user_id
    if not is_admin:
        if caller_id:
            user_id = caller_id
        else:
            raise HTTPException(status_code=401, detail="Authorization required")

    conversions = load_conversions(user_id)
    total = len(conversions)

    # Reverse to show newest first
    conversions = list(reversed(conversions))

    # Paginate
    page = conversions[offset : offset + limit]

    return {
        "ok": True,
        "total": total,
        "offset": offset,
        "limit": limit,
        "conversions": page,
    }


@app.get("/api/midi/{filename}")
async def get_midi(filename: str, authorization: str | None = Header(None)):
    """Serve a MIDI file."""
    caller = extract_user_from_header(authorization)
    caller_id = caller.get("id") if caller else None
    is_admin = caller_id in ADMIN_IDS if caller_id else False

    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Search for the MIDI file in common locations
    search_dirs = [
        Path(MIDI_DIR),
        Path(MIDI_DIR) / "output",
        Path(MIDI_DIR) / "midi_output",
        Path(MIDI_DIR) / "results",
    ]

    for search_dir in search_dirs:
        file_path = search_dir / filename
        if file_path.exists() and file_path.suffix.lower() in (".mid", ".midi"):
            return FileResponse(
                path=str(file_path),
                media_type="audio/midi",
                filename=filename,
            )

    raise HTTPException(status_code=404, detail="MIDI file not found")


@app.get("/api/stats")
async def get_stats(authorization: str | None = Header(None)):
    """Get conversion statistics (admin only)."""
    caller = extract_user_from_header(authorization)
    caller_id = caller.get("id") if caller else None
    is_admin = caller_id in ADMIN_IDS if caller_id else False

    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    all_conversions = load_conversions()
    total = len(all_conversions)

    # Count by action
    actions: dict[str, int] = {}
    methods: dict[str, int] = {}
    users: set[str] = set()

    for c in all_conversions:
        actions[c["action"]] = actions.get(c["action"], 0) + 1
        methods[c["method"]] = methods.get(c["method"], 0) + 1
        users.add(c["user_id"])

    return {
        "ok": True,
        "total_conversions": total,
        "unique_users": len(users),
        "by_action": actions,
        "by_method": methods,
    }


@app.get("/api/latest-midi")
async def get_latest_midi(
    midi_id: str | None = Query(None, description="MIDI file ID (filename without extension)"),
    user_id: int | None = Query(None, description="User ID to find latest MIDI for"),
    authorization: str | None = Header(None),
):
    """
    Get MIDI file for piano roll visualization.
    
    Priority:
    1. midi_id — direct file lookup
    2. user_id — find latest MIDI for user (TODO: implement when DB stores MIDI refs)
    
    Returns base64-encoded MIDI data for frontend parsing.
    """
    caller = extract_user_from_header(authorization)
    caller_id = caller.get("id") if caller else None
    is_admin = caller_id in ADMIN_IDS if caller_id else False

    # For non-admins, can only access own data (when user_id implemented)
    if not is_admin and not midi_id:
        if not caller_id:
            raise HTTPException(status_code=401, detail="Authorization required")
        user_id = caller_id

    # Try to find MIDI file
    midi_path = None
    filename = None

    if midi_id:
        # Sanitize midi_id to prevent path traversal
        safe_id = re.sub(r'[^\w\-.]', '', midi_id)
        if not safe_id:
            raise HTTPException(status_code=400, detail="Invalid midi_id")
        
        # Search in multiple locations
        search_paths = [
            MINIAPP_MIDI_DIR / f"{safe_id}.mid",
            MINIAPP_MIDI_DIR / f"{safe_id}.midi",
            MINIAPP_MIDI_DIR / safe_id,  # If full filename provided
            Path(MIDI_DIR) / f"{safe_id}.mid",
            Path(MIDI_DIR) / f"{safe_id}.midi",
            Path("/tmp") / f"{safe_id}.mid",  # Temp files
        ]
        
        for p in search_paths:
            if p.exists() and p.suffix.lower() in ('.mid', '.midi'):
                midi_path = p
                filename = p.name
                break
    
    if not midi_path:
        return JSONResponse(
            status_code=404,
            content={
                "ok": False,
                "error": "MIDI file not found",
                "hint": "Use midi_id parameter with a valid MIDI file ID"
            }
        )

    # Read and encode MIDI file
    try:
        midi_data = midi_path.read_bytes()
        midi_b64 = base64.b64encode(midi_data).decode('ascii')
        
        return {
            "ok": True,
            "filename": filename,
            "midi_id": midi_id or midi_path.stem,
            "size": len(midi_data),
            "data": midi_b64,  # Base64-encoded MIDI
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read MIDI: {e}")


@app.get("/api/midi-file/{midi_id}")
async def download_midi_file(
    midi_id: str,
    authorization: str | None = Header(None),
):
    """
    Download MIDI file directly (binary response).
    Useful for direct linking.
    """
    caller = extract_user_from_header(authorization)
    caller_id = caller.get("id") if caller else None
    is_admin = caller_id in ADMIN_IDS if caller_id else False

    # Sanitize midi_id
    safe_id = re.sub(r'[^\w\-.]', '', midi_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid midi_id")

    # Search for file
    search_paths = [
        MINIAPP_MIDI_DIR / f"{safe_id}.mid",
        MINIAPP_MIDI_DIR / f"{safe_id}.midi",
        MINIAPP_MIDI_DIR / safe_id,
        Path(MIDI_DIR) / f"{safe_id}.mid",
        Path("/tmp") / f"{safe_id}.mid",
    ]

    for p in search_paths:
        if p.exists() and p.suffix.lower() in ('.mid', '.midi'):
            return FileResponse(
                path=str(p),
                media_type="audio/midi",
                filename=p.name,
            )

    raise HTTPException(status_code=404, detail="MIDI file not found")

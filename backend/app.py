"""Audio2MIDI Mini App — Backend API."""

import re
import base64
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header, Query, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from auth import validate_init_data
from config import ADMIN_IDS, MIDI_DIR, CORS_ORIGINS

# Directory for MIDI storage
MIDI_PATH = Path(MIDI_DIR)

app = FastAPI(title="Audio2MIDI Mini App API", version="1.0.0")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---
class AuthRequest(BaseModel):
    initData: str


class AuthResponse(BaseModel):
    ok: bool
    user: dict | None = None
    is_admin: bool = False
    error: str | None = None


# --- Helpers ---
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
    return {"status": "ok", "midi_dir": str(MIDI_PATH)}


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


@app.get("/api/midi/{filename}")
async def get_midi(filename: str, authorization: str | None = Header(None)):
    """Serve a MIDI file by filename."""
    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Search for the MIDI file
    search_dirs = [
        MIDI_PATH,
        MIDI_PATH / "output",
        MIDI_PATH / "miniapp",
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


@app.get("/api/latest-midi")
async def get_latest_midi(
    midi_id: str | None = Query(None, description="MIDI file ID (filename without extension)"),
    authorization: str | None = Header(None),
):
    """
    Get MIDI file for piano roll visualization.
    Returns base64-encoded MIDI data for frontend parsing.
    """
    if not midi_id:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "midi_id is required"}
        )

    # Sanitize midi_id to prevent path traversal
    safe_id = re.sub(r'[^\w\-.]', '', midi_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid midi_id")
    
    # Search in multiple locations
    search_paths = [
        MIDI_PATH / f"{safe_id}.mid",
        MIDI_PATH / f"{safe_id}.midi",
        MIDI_PATH / safe_id,
        MIDI_PATH / "miniapp" / f"{safe_id}.mid",
        MIDI_PATH / "output" / f"{safe_id}.mid",
    ]
    
    midi_path = None
    for p in search_paths:
        if p.exists() and p.suffix.lower() in ('.mid', '.midi'):
            midi_path = p
            break
    
    if not midi_path:
        return JSONResponse(
            status_code=404,
            content={
                "ok": False,
                "error": "MIDI file not found",
                "searched": [str(p) for p in search_paths[:3]]
            }
        )

    # Read and encode MIDI file
    try:
        midi_data = midi_path.read_bytes()
        midi_b64 = base64.b64encode(midi_data).decode('ascii')
        
        return {
            "ok": True,
            "filename": midi_path.name,
            "midi_id": safe_id,
            "size": len(midi_data),
            "data": midi_b64,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read MIDI: {e}")


@app.get("/api/midi-file/{midi_id}")
async def download_midi_file(midi_id: str):
    """Download MIDI file directly (binary response)."""
    safe_id = re.sub(r'[^\w\-.]', '', midi_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid midi_id")

    search_paths = [
        MIDI_PATH / f"{safe_id}.mid",
        MIDI_PATH / f"{safe_id}.midi",
        MIDI_PATH / safe_id,
        MIDI_PATH / "miniapp" / f"{safe_id}.mid",
    ]

    for p in search_paths:
        if p.exists() and p.suffix.lower() in ('.mid', '.midi'):
            return FileResponse(
                path=str(p),
                media_type="audio/midi",
                filename=p.name,
            )

    raise HTTPException(status_code=404, detail="MIDI file not found")


@app.post("/api/upload-midi")
async def upload_midi(
    file: UploadFile = File(...),
    user_id: str = Form(None),
):
    """
    Upload MIDI file from bot.
    Returns midi_id that can be used in Mini App URL.
    """
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Generate unique midi_id
    original_name = Path(file.filename).stem
    midi_id = f"{original_name}_{uuid.uuid4().hex[:8]}"
    
    # Ensure directory exists
    MIDI_PATH.mkdir(parents=True, exist_ok=True)
    
    # Save file
    file_path = MIDI_PATH / f"{midi_id}.mid"
    content = await file.read()
    
    # Basic validation - MIDI files start with "MThd"
    if not content.startswith(b'MThd'):
        raise HTTPException(status_code=400, detail="Invalid MIDI file")
    
    file_path.write_bytes(content)
    
    return {
        "ok": True,
        "midi_id": midi_id,
        "filename": f"{midi_id}.mid",
        "size": len(content),
        "user_id": user_id,
    }


@app.get("/api/list")
async def list_midi_files(authorization: str | None = Header(None)):
    """List available MIDI files (for testing)."""
    caller = extract_user_from_header(authorization)
    caller_id = caller.get("id") if caller else None
    is_admin = caller_id in ADMIN_IDS if caller_id else False

    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    files = []
    for p in MIDI_PATH.rglob("*.mid"):
        files.append({
            "name": p.name,
            "path": str(p.relative_to(MIDI_PATH)),
            "size": p.stat().st_size
        })
    
    return {"ok": True, "files": files[:100]}  # Limit to 100

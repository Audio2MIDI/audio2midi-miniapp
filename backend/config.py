import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if exists (for local development)
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    import warnings
    warnings.warn("BOT_TOKEN not set - initData validation will be disabled!")

# Admin IDs from env (comma-separated) or default
ADMIN_IDS_STR = os.getenv("ADMIN_IDS", "371331803,222481527,937601928,1171392154,147583899")
ADMIN_IDS = {int(x.strip()) for x in ADMIN_IDS_STR.split(",") if x.strip()}

# MIDI directory from env
MIDI_DIR = os.getenv("MIDI_DIR", "/data/midi")

# CORS origins
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://*.ngrok-free.app",
    "https://*.ngrok.io",
]

CACHE_TTL_SECONDS = 300  # 5 minutes

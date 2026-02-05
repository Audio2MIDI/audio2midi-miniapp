import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from Audio2MIDI project
AUDIO2MIDI_ENV = Path("/home/jatana/Audio2MIDI/.env")
if AUDIO2MIDI_ENV.exists():
    load_dotenv(AUDIO2MIDI_ENV)

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN not found. Set it in env or /home/jatana/Audio2MIDI/.env")

ADMIN_IDS = {371331803}

ACTION_LOG_PATH = "/home/jatana/Audio2MIDI/current_action_log.txt"
MIDI_DIR = "/home/jatana/Audio2MIDI"  # adjust if MIDI files are elsewhere

# CORS origins
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://*.ngrok-free.app",
    "https://*.ngrok.io",
]

CACHE_TTL_SECONDS = 300  # 5 minutes

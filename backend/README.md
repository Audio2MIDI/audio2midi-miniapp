# Audio2MIDI Mini App — Backend API

FastAPI backend for the Audio2MIDI Telegram Mini App.

## Setup

```bash
cd /home/vosatorp/audio2midi-miniapp/backend
pip install -r requirements.txt
```

## Configuration

The bot token is read from `/home/jatana/Audio2MIDI/.env` (`BOT_TOKEN` variable).  
Admin IDs are configured in `config.py`.

## Run

```bash
uvicorn app:app --host 0.0.0.0 --port 3001 --reload
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/auth` | POST | Validate Telegram initData, returns user info |
| `/api/conversions` | GET | List conversions (parsed from action log) |
| `/api/midi/{filename}` | GET | Download a MIDI file |
| `/api/stats` | GET | Conversion statistics (admin only) |

### Auth

POST `/api/auth` with body:
```json
{"initData": "<telegram_init_data_string>"}
```

### Conversions

GET `/api/conversions?user_id=123&limit=50&offset=0`

Requires `Authorization: tma <initData>` header.  
Admins can query any user; non-admins see only their own data.

### Stats

GET `/api/stats` — admin only, returns aggregated statistics.

## Architecture

- `app.py` — FastAPI application, endpoints, log parser
- `auth.py` — Telegram initData HMAC-SHA256 validation
- `config.py` — Configuration (reads from Audio2MIDI .env)

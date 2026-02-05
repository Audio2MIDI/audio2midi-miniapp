# Audio2MIDI Mini App

Piano Roll visualization for Telegram Mini App.

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env and set your BOT_TOKEN

# 2. Build and run
docker compose up -d --build

# 3. Check status
docker compose ps
```

App will be available on port 80.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token (for initData validation) | required |
| `ADMIN_IDS` | Comma-separated admin user IDs | `371331803` |
| `MIDI_DIR` | Directory for MIDI files | `/data/midi` |

## Architecture

```
┌─────────────────────┐      POST /api/upload-midi      ┌─────────────────────┐
│    Audio2MIDI Bot   │ ────────────────────────────────│    Mini App Server  │
│   (Your Server)     │        (MIDI file)              │   (Misha's Server)  │
└─────────────────────┘                                 └─────────────────────┘
         │                                                        │
         │                                                        │
         ▼                                                        ▼
┌─────────────────────┐                                 ┌─────────────────────┐
│  User in Telegram   │ ──── Opens Mini App URL ─────── │   Piano Roll UI     │
└─────────────────────┘                                 └─────────────────────┘
```

### Bot → Mini App Flow

1. User sends song to bot
2. Bot converts to MIDI
3. Bot uploads MIDI via `POST /api/upload-midi` → gets `midi_id`
4. Bot sends button with URL: `https://app.audio2midi.ru/?midi={midi_id}`
5. User opens Mini App → Piano Roll loads MIDI automatically

### Bot Integration

In your bot, set `MINIAPP_URL` environment variable:

```bash
# Development (tunnel)
MINIAPP_URL=https://your-tunnel.pinggy.link

# Production
MINIAPP_URL=https://app.audio2midi.ru
```

Bot code uploads MIDI:
```python
async with httpx.AsyncClient() as client:
    response = await client.post(
        f"{MINIAPP_URL}/api/upload-midi",
        files={"file": (filename, midi_bytes, "audio/midi")},
        data={"user_id": str(user_id)},
    )
    midi_id = response.json()["midi_id"]
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload-midi` | POST | Upload MIDI from bot (multipart/form-data) |
| `/api/latest-midi?midi_id=X` | GET | Get MIDI as base64 for frontend |
| `/api/midi/{filename}` | GET | Download MIDI file |
| `/api/midi-file/{midi_id}` | GET | Download MIDI by ID |
| `/api/auth` | POST | Validate Telegram initData |
| `/api/list` | GET | List MIDI files (admin only) |

### Upload MIDI

```bash
curl -X POST https://app.audio2midi.ru/api/upload-midi \
  -F "file=@song.mid" \
  -F "user_id=123456789"
```

Response:
```json
{
  "ok": true,
  "midi_id": "song_a1b2c3d4",
  "filename": "song_a1b2c3d4.mid",
  "size": 12345
}
```

## Frontend

- React + TypeScript + Vite
- Canvas-based Piano Roll
- Tone.js for MIDI playback
- Touch support (pinch-to-zoom, scroll)
- Telegram theme integration (dark/light)

## Production Deployment

### With Traefik (recommended)

Add labels to frontend service in `docker-compose.yaml`:

```yaml
frontend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.miniapp.rule=Host(`app.audio2midi.ru`)"
    - "traefik.http.routers.miniapp.tls.certresolver=letsencrypt"
```

### Manual SSL with nginx

1. Add DNS A record pointing to your server
2. Install certbot: `apt install certbot python3-certbot-nginx`
3. Get certificate: `certbot --nginx -d app.audio2midi.ru`

## Development

### Frontend only
```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### Backend only
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 3001
```

### Testing in browser
Open `http://localhost:3000/?dev=1&midi=test` to bypass Telegram auth.

## Volumes

- `midi_data` - MIDI files storage (persistent)

## License

MIT

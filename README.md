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
┌─────────────────────────────────────────────────────┐
│                    Frontend (nginx)                 │
│                      Port 80                        │
├─────────────────────────────────────────────────────┤
│  /           → React SPA (static files)            │
│  /api/*      → Backend proxy                       │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Backend (FastAPI)                   │
│                    Port 8001                        │
├─────────────────────────────────────────────────────┤
│  GET  /api/midi/{file_id}   → MIDI file download   │
│  GET  /api/midi/{file_id}/info → MIDI metadata     │
│  GET  /api/health           → Health check         │
└─────────────────────────────────────────────────────┘
```

## Production Deployment

### With Traefik (recommended)

Add labels to frontend service in `docker-compose.yaml`:

```yaml
frontend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.miniapp.rule=Host(`miniapp.yourdomain.com`)"
    - "traefik.http.routers.miniapp.tls.certresolver=letsencrypt"
```

### Manual SSL with nginx

1. Add DNS A record pointing to your server
2. Install certbot: `apt install certbot python3-certbot-nginx`
3. Get certificate: `certbot --nginx -d miniapp.yourdomain.com`

## Development

### Frontend only
```bash
cd frontend
npm install
npm run dev
```

### Backend only
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```

## Volumes

- `midi_data` - MIDI files storage (persistent)

## License

MIT

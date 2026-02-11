# Audio2MIDI Mini App — Backend API

FastAPI backend для Telegram Mini App.

## Setup

```bash
cd backend
uv sync
```

## Configuration

Переменные окружения (см. `../.env.example`):
- `BOT_TOKEN` — Telegram bot token (обязательно для валидации initData)
- `ADMIN_IDS` — ID админов через запятую
- `MIDI_DIR` — директория для MIDI файлов (по умолчанию `/data/midi`)

## Run

```bash
uv run uvicorn app:app --host 0.0.0.0 --port 3001 --reload
```

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/health` | GET | Health check |
| `/api/auth` | POST | Валидация Telegram initData, возвращает user info |
| `/api/upload-midi` | POST | Загрузить MIDI файл (multipart/form-data) |
| `/api/latest-midi` | GET | Получить MIDI как base64 по midi_id |
| `/api/midi/{filename}` | GET | Скачать MIDI файл по имени |
| `/api/midi-file/{midi_id}` | GET | Скачать MIDI по ID |
| `/api/list` | GET | Список MIDI файлов (только админ) |

## Architecture

- `app.py` — FastAPI application, все endpoints
- `auth.py` — Telegram initData HMAC-SHA256 валидация
- `config.py` — Конфигурация из env vars

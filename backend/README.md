# Audio2MIDI legacy MIDI API

Исторический MIDI-only backend. Текущий личный кабинет использует account API
`web_api/app.py` из основного репозитория Audio2MIDI на порту 8400.
Этот каталог не запускается основным Compose; инструкции для актуального
клиента находятся в [корневом README](../README.md).

## Setup

```bash
cd backend
uv sync
```

## Configuration

Переменные окружения для отдельного legacy-запуска (задаются в shell либо
в игнорируемом `backend/.env`; корневой `.env.example` теперь относится к frontend):
- `BOT_TOKEN` — Telegram bot token (обязательно для валидации initData)
- `ADMIN_IDS` — ID админов через запятую
- `MIDI_DIR` — директория для MIDI файлов (по умолчанию `/data/midi`)

## Run

```bash
uv run uvicorn app:app --host 127.0.0.1 --port 3001 --reload
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

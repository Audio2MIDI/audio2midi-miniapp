# Audio2MIDI Mini App

Piano Roll визуализатор MIDI файлов для Telegram Mini App.  
Работает целиком в браузере — парсит MIDI и рисует ноты на Canvas с воспроизведением через Grand Piano (Salamander samples).

## Quick Start (Docker)

```bash
# 1. Настроить окружение
cp .env.example .env
# Отредактировать .env — указать BOT_TOKEN

# 2. Собрать и запустить
docker compose up -d --build

# 3. Проверить статус
docker compose ps
```

Приложение будет доступно на порту 80.

## Quick Start (Dev)

```bash
# Backend
cd backend
uv sync
uv run uvicorn app:app --host 0.0.0.0 --port 3001 --reload

# Frontend (в другом терминале)
cd frontend
npm install
npm run dev  # http://localhost:3000
```

Vite проксирует `/api/*` на backend (:3001).

### Тестирование в браузере

```
# Dev mode (без Telegram)
http://localhost:3000/?dev=1

# С конкретным MIDI из бэкенда
http://localhost:3000/?dev=1&midi=test_id

# С прямой ссылкой на MIDI файл (S3, URL)
http://localhost:3000/?file=https://s3.example.com/song.mid
```

## Конфигурация

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `BOT_TOKEN` | Telegram bot token (для валидации initData) | обязательно |
| `ADMIN_IDS` | ID админов через запятую | `371331803` |
| `MIDI_DIR` | Директория для MIDI файлов | `/data/midi` |

## Архитектура

```
┌─────────────────────┐      POST /api/upload-midi      ┌─────────────────────┐
│    Audio2MIDI Bot    │ ───────────────────────────────▶│   Mini App Server   │
│   (наш сервер)      │        (MIDI файл)              │  (сервер Миши)      │
└─────────────────────┘                                 └─────────────────────┘
         │                                                        │
         │                                                        │
         ▼                                                        ▼
┌─────────────────────┐                                 ┌─────────────────────┐
│  Юзер в Telegram    │ ──── Открывает Mini App ──────▶ │   Piano Roll UI     │
└─────────────────────┘                                 └─────────────────────┘
```

### Как работает

1. Юзер отправляет песню боту
2. Бот конвертирует в MIDI
3. Бот загружает MIDI через `POST /api/upload-midi` → получает `midi_id`
4. Бот отправляет кнопку с URL: `https://app.audio2midi.ru/?midi={midi_id}`
5. Юзер открывает Mini App → Piano Roll загружает MIDI автоматически

### Альтернативный режим: прямая ссылка

Визуализатор может загружать MIDI по прямому URL (например, из S3):

```
https://app.audio2midi.ru/?file=https://s3.rapid-vision.ru/a2m/song.mid
```

MIDI загружается и парсится прямо в браузере. Серверный бэкенд для этого не нужен.

### Интеграция с ботом

В боте указать `MINIAPP_URL`:

```bash
# Для разработки (tunnel)
MINIAPP_URL=https://your-tunnel.pinggy.link

# Продакшн
MINIAPP_URL=https://app.audio2midi.ru
```

Код бота для загрузки MIDI:
```python
async with httpx.AsyncClient() as client:
    response = await client.post(
        f"{MINIAPP_URL}/api/upload-midi",
        files={"file": (filename, midi_bytes, "audio/midi")},
        data={"user_id": str(user_id)},
    )
    midi_id = response.json()["midi_id"]
```

## API

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/health` | GET | Health check |
| `/api/upload-midi` | POST | Загрузить MIDI из бота (multipart/form-data) |
| `/api/latest-midi?midi_id=X` | GET | Получить MIDI как base64 для фронтенда |
| `/api/midi/{filename}` | GET | Скачать MIDI файл по имени |
| `/api/midi-file/{midi_id}` | GET | Скачать MIDI по ID |
| `/api/auth` | POST | Валидация Telegram initData |
| `/api/list` | GET | Список MIDI файлов (только админ) |

### Upload MIDI

```bash
curl -X POST https://app.audio2midi.ru/api/upload-midi \
  -F "file=@song.mid" \
  -F "user_id=123456789"
```

Ответ:
```json
{
  "ok": true,
  "midi_id": "song_a1b2c3d4",
  "filename": "song_a1b2c3d4.mid",
  "size": 12345
}
```

## Функции Piano Roll

- 🎹 Canvas-based визуализация нот
- 🎵 Воспроизведение Grand Piano (Salamander samples)
- 🔄 Два режима: горизонтальный (классический) и вертикальный (Guitar Hero)
- 📱 Touch support: pinch-to-zoom, свайп для скролла
- 🎨 Цвета нот по velocity (от синего к красному)
- 🌙 Поддержка тем Telegram (dark/light)
- 📂 Drag & drop для MIDI файлов
- 🔗 Загрузка по URL (`?file=`) или из бэкенда (`?midi=`)

## Стек

- **Frontend:** React 19 + TypeScript + Vite
- **Визуализация:** Canvas API
- **Звук:** Tone.js + @tonejs/midi
- **Backend:** FastAPI + Python 3.11 + uv
- **Инфра:** Docker + nginx
- **Telegram:** WebApp SDK

## Структура проекта

```
audio2midi-miniapp/
├── frontend/                  # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx            # Главный компонент (auth gate + layout)
│   │   ├── main.tsx           # Entry point
│   │   ├── components/
│   │   │   └── PianoRoll.tsx  # Визуализатор (Canvas + Tone.js)
│   │   ├── api/
│   │   │   ├── client.ts     # Typed API client (fetch wrapper)
│   │   │   ├── midi.ts       # MIDI API functions
│   │   │   └── types.ts      # TypeScript типы ответов
│   │   ├── hooks/
│   │   │   └── useTelegram.ts # Telegram WebApp SDK integration
│   │   └── styles/
│   │       └── global.css     # Темы, кнопки, анимации
│   ├── index.html             # HTML шаблон (Telegram SDK скрипт)
│   ├── package.json
│   ├── vite.config.ts         # Dev server + proxy /api → :3001
│   ├── tsconfig.json
│   └── eslint.config.js
├── backend/                   # FastAPI
│   ├── app.py                 # Endpoints (upload, latest-midi, auth, list)
│   ├── auth.py                # HMAC-SHA256 валидация initData
│   ├── config.py              # Конфигурация (env vars)
│   ├── pyproject.toml         # Python зависимости (uv)
│   └── uv.lock
├── docker-compose.yaml        # Docker деплой (frontend + backend)
├── Dockerfile.frontend        # Multi-stage: npm build → nginx
├── Dockerfile.backend         # Python + uv
├── nginx.conf                 # Proxy /api → backend
├── .env.example               # Шаблон переменных окружения
├── DEPLOY.md                  # Инструкции по деплою
└── REVIEW.md                  # Code review заметки
```

## Деплой

См. [DEPLOY.md](DEPLOY.md) — инструкции по деплою на сервер.

### Кратко

Для статичного деплоя (без бэкенда, только визуализатор по `?file=` URL):
```bash
cd frontend && npm install && npm run build
# Скопировать dist/* на веб-сервер с HTTPS
```

Для полного деплоя (с бэкендом для upload/list):
```bash
docker compose up -d --build
```

## Текущий статус

- **Наш визуализатор:** собран, не захостен (ждёт субдомен `app.audio2midi.ru`)
- **Временный:** используется `audio2midi.ru/visualizer` (старый визуализатор Миши)

## License

MIT

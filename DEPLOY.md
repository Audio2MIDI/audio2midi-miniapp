# Деплой MiniApp Piano Roll

## Что это
Кастомный Piano Roll визуализатор для MIDI файлов. Работает целиком в браузере — серверная часть опциональна. Используется как Telegram MiniApp (открывается внутри Telegram по кнопке).

## Репозиторий
```
https://github.com/Audio2MIDI/audio2midi-miniapp.git
```

## Требования
- Node.js 18+ (для сборки)
- Любой веб-сервер с HTTPS (nginx, caddy, apache, etc.)

## Деплой (статичный фронтенд)

Для базового визуализатора бэкенд не нужен — MIDI загружается по прямому URL через параметр `?file=`.

```bash
git clone https://github.com/Audio2MIDI/audio2midi-miniapp.git
cd audio2midi-miniapp/frontend

npm install
npm run build

# Результат в dist/ (~480 КБ)
cp -r dist/* /путь/к/сайту/app/
```

### Настройка nginx

```nginx
location /app/ {
    alias /путь/к/статике/app/;
    try_files $uri $uri/ /app/index.html;
}
```

```bash
sudo nginx -s reload
```

## Деплой (полный, с бэкендом)

Полный деплой включает FastAPI бэкенд для загрузки MIDI через API (используется ботом).

```bash
git clone https://github.com/Audio2MIDI/audio2midi-miniapp.git
cd audio2midi-miniapp

cp .env.example .env
# Отредактировать .env — указать BOT_TOKEN

docker compose up -d --build
```

Приложение будет доступно на порту 80. Для HTTPS — поставить reverse proxy (Traefik, Caddy, nginx + certbot).

## Использование

### Режим 1: Прямая ссылка на MIDI (без бэкенда)

Визуализатор принимает URL MIDI-файла через query-параметр `file`:

```
https://your-domain.com/app/?file=https://s3.rapid-vision.ru/a2m/example.mid
```

MIDI загружается и парсится прямо в браузере через JavaScript.

### Режим 2: Через бэкенд API (с ботом)

Бот загружает MIDI через `POST /api/upload-midi`, получает `midi_id`, и формирует ссылку:

```
https://your-domain.com/?midi=song_a1b2c3d4
```

## Интеграция с ботом Audio2MIDI

Бот формирует кнопку "🎹 Piano Roll" с URL визуализатора. Настройка URL — в файле:
- `/home/jatana/Audio2MIDI/utils.py` — функции `upload_and_log()` и `send_files()`
- Переменная: `visualizer_url = f"https://audio2midi.ru/visualizer?file=..."`
- При смене домена/пути — поменять URL здесь

## Текущий статус
- **Наш визуализатор:** собран, не захостен (нужен сервер с HTTPS, ждём субдомен `app.audio2midi.ru`)
- **Временный:** используется `audio2midi.ru/visualizer` (старый визуализатор на сервере Миши)

## Структура проекта

```
audio2midi-miniapp/
├── frontend/                # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/
│   │   │   └── PianoRoll.tsx    # Основной визуализатор (вертикальный + горизонтальный)
│   │   ├── api/                 # Typed API client
│   │   ├── hooks/
│   │   │   └── useTelegram.ts   # Telegram WebApp SDK
│   │   └── App.tsx
│   └── package.json
├── backend/                 # FastAPI (опционально, для upload/list API)
│   ├── app.py
│   ├── auth.py
│   ├── config.py
│   └── pyproject.toml
├── docker-compose.yaml      # Docker деплой (фронт + бэкенд + nginx)
├── Dockerfile.frontend      # Multi-stage: npm build → nginx
├── Dockerfile.backend       # Python + uv
├── nginx.conf               # Proxy /api → backend
├── .env.example
├── DEPLOY.md                # ← Этот файл
└── README.md
```

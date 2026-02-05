# Audio2MIDI Mini App — Review

**Дата ревью:** 2025-02-05
**Ревьюер:** Claude (sub-agent)

---

## Статус компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Frontend (React + Vite) | ✅ | Работает на :3000, TypeScript компилируется без ошибок |
| Backend (FastAPI) | ✅ | Работает на :3001, health OK, auth проверяется |
| Piano Roll (Canvas) | ✅ | Полноценный рендер, zoom/scroll, playback через Tone.js |
| Telegram WebApp | ⚠️ | initData валидация правильная, но frontend не делает серверную проверку |
| Frontend ↔ Backend | ⚠️ | Proxy настроен, но frontend НЕ делает API-запросов к backend |
| ngrok | ⚠️ | Установлен (snap v3.34.1), но нужен authtoken |
| Безопасность | ⚠️ | CORS исправлен, path traversal защищён, но `?dev=1` обходит admin check |

---

## Найденные проблемы и фиксы

### 🔧 Исправлено в этом ревью

1. **❌ Отсутствовали npm-зависимости `@tonejs/midi` и `tone`**
   - PianoRoll.tsx импортирует их, но в package.json не было
   - **Фикс:** добавлены `@tonejs/midi: ^2.0.28`, `tone: ^15.0.4` в dependencies

2. **❌ CORS allow_origins=["*"] вместо настроенного списка**
   - config.py определяет CORS_ORIGINS, но app.py использовал `["*"]`
   - **Фикс:** заменено на `CORS_ORIGINS` из config

3. **❌ Нет Vite proxy для /api**
   - Frontend не мог проксировать запросы к backend
   - **Фикс:** добавлен `proxy: { '/api': { target: 'http://localhost:3001' } }` в vite.config.ts

4. **❌ Canvas DPR rendering bug (High-DPI / mobile)**
   - `draw()` использовал `canvas.width/height` (физические пиксели) для координат, но `ctx.scale(dpr, dpr)` уже был применён в resize — на Retina/mobile всё рисовалось за пределами видимой области
   - `keyW = PIANO_KEY_WIDTH * dpr` — двойное масштабирование
   - `font: ${x * dpr / dpr}px` — бессмысленное dpr/dpr
   - **Фикс:** `W = canvas.width / dpr`, `H = canvas.height / dpr`, `keyW = PIANO_KEY_WIDTH`, убран dpr/dpr в font

5. **❌ npm install не был выполнен (нет node_modules)**
   - **Фикс:** выполнен `npm install --prefer-offline`

### ⚠️ Требуют внимания

6. **Frontend не делает API-запросов к backend**
   - Backend имеет `/api/auth`, `/api/conversions`, `/api/midi/{filename}`, `/api/stats`
   - Но PianoRoll только загружает локальные файлы через drag&drop / file picker
   - Нет загрузки MIDI с сервера, нет отображения истории конверсий
   - **Рекомендация:** добавить экран списка конверсий + загрузку MIDI с сервера

7. **`?dev=1` обходит admin check на клиенте**
   - В `useTelegram.ts`: если `?dev=1` в URL — `isAdmin = true` без проверки
   - В продакшене это не критично (backend всё равно проверяет auth), но стоит ограничить
   - **Рекомендация:** проверять `import.meta.env.DEV` вместо URL-параметра

8. **Серверная валидация initData НЕ используется frontend'ом**
   - `useTelegram` использует только `initDataUnsafe` (клиентский, без проверки подписи)
   - Должен отправлять `initData` на `/api/auth` для подтверждения
   - **Рекомендация:** добавить вызов `/api/auth` при загрузке приложения

9. **ADMIN_IDS дублируются**
   - Frontend: `useTelegram.ts` → `const ADMIN_IDS = [371331803]`
   - Backend: `config.py` → `ADMIN_IDS = {371331803}`
   - **Рекомендация:** frontend должен получать `is_admin` из ответа `/api/auth`

10. **ngrok authtoken не настроен**
    - Файл конфигурации отсутствует: `/home/vosatorp/snap/ngrok/340/.config/ngrok/ngrok.yml`
    - Нужно: `snap run ngrok config add-authtoken <TOKEN>`

### ✅ Всё в порядке

11. **initData HMAC-SHA256 валидация (backend)** — корректная реализация по [документации Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
12. **BOT_TOKEN** — читается из `.env`, не захардкожен
13. **Path traversal** — проверка `".." in filename or "/" in filename` есть
14. **Python синтаксис** — все файлы парсятся без ошибок
15. **TypeScript** — компилируется без ошибок (`tsc --noEmit` = 0)
16. **Auth на /api/conversions** — возвращает 401 без авторизации ✓
17. **Telegram WebApp SDK** — подключен в index.html, `tg.ready()` и `tg.expand()` вызываются
18. **Тема Telegram** — `colorScheme` подхватывается, CSS custom properties для light/dark
19. **Piano Roll** — полноценный canvas рендеринг, velocity-based colors, bar numbers, note names, zoom (0.3x–5x), scroll (mouse + touch), playback с playhead
20. **Touch support** — отдельные touch handlers для мобильного скролла

---

## Архитектура

```
┌─────────────────────────────────────────┐
│  Telegram WebApp (iframe)               │
│  ┌───────────────────────────────────┐  │
│  │ Frontend (Vite + React) :3000     │  │
│  │  ├── App.tsx (admin gate)         │  │
│  │  ├── useTelegram.ts (TG SDK)      │  │
│  │  └── PianoRoll.tsx (Canvas)       │  │
│  └───────────┬───────────────────────┘  │
│              │ /api/* (proxy)            │
│  ┌───────────▼───────────────────────┐  │
│  │ Backend (FastAPI) :3001           │  │
│  │  ├── /api/health                  │  │
│  │  ├── /api/auth (initData check)   │  │
│  │  ├── /api/conversions             │  │
│  │  ├── /api/midi/{filename}         │  │
│  │  └── /api/stats                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
         ▲ HTTPS tunnel (ngrok)
         │
    Telegram servers
```

---

## Что нужно для запуска

1. **Node.js** ≥ 18 — ✅ установлен (v24.12.0)
2. **Python 3.10+** — ✅ установлен
3. **BOT_TOKEN** в `/home/jatana/Audio2MIDI/.env` — ✅ есть
4. **ngrok authtoken** — ❌ нужно настроить:
   ```bash
   snap run ngrok config add-authtoken <YOUR_TOKEN>
   ```
   Получить: https://dashboard.ngrok.com/get-started/your-authtoken

---

## Как запустить всё за 1 минуту

```bash
# 1. Backend (уже работает, но если нужно перезапустить):
cd /home/vosatorp/audio2midi-miniapp/backend
nohup uvicorn app:app --host 0.0.0.0 --port 3001 --reload > /tmp/miniapp-backend.log 2>&1 &

# 2. Frontend:
cd /home/vosatorp/audio2midi-miniapp
npm install --prefer-offline  # если первый раз
nohup npx vite --host 0.0.0.0 --port 3000 > /tmp/miniapp-frontend.log 2>&1 &

# 3. ngrok туннель (нужен authtoken!):
snap run ngrok http 3000

# 4. Открыть в Telegram:
# Скопировать https://xxxx.ngrok-free.app URL из ngrok
# Установить как WebApp URL в @BotFather → /mybots → Bot Settings → Menu Button
# Или: отправить inline button с web_app url

# 5. Для разработки без Telegram:
# Открыть http://localhost:3000?dev=1
```

### Быстрый one-liner (dev mode):
```bash
cd /home/vosatorp/audio2midi-miniapp && \
  (cd backend && uvicorn app:app --host 0.0.0.0 --port 3001 --reload &) && \
  npx vite --host 0.0.0.0 --port 3000
```

---

## Следующие шаги (TODO)

1. **[ ] Подключить frontend к backend API** — загрузка MIDI с сервера, список конверсий
2. **[ ] Серверная валидация initData** — frontend → `/api/auth` → получить is_admin
3. **[ ] Убрать дублирование ADMIN_IDS** — только backend должен решать
4. **[ ] Ограничить `?dev=1`** — только в `import.meta.env.DEV` (Vite dev mode)
5. **[ ] Настроить ngrok authtoken** — или использовать cloudflared
6. **[ ] Добавить MainButton/BackButton** — Telegram WebApp navigation
7. **[ ] Pinch-to-zoom** — для мобильного touch zoom (сейчас только wheel + ctrl)
8. **[ ] Error boundaries** — React error boundary для graceful failure
9. **[ ] Production build** — `npm run build` + static serve через nginx/caddy

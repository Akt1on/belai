# BELDOR AI v4 — Визуализатор покрытий

ИИ-инструмент для визуализации асфальта, брусчатки, бетона и щебня на фото участка.

## Что нового в v4

- ✅ **Автоопределение зоны** — Claude Vision анализирует фото и сам рисует маску
- ✅ **Правильный canvas** — координаты масштабируются корректно (retina/мобильный)
- ✅ **Рабочий inpainting** — `stabilityai/stable-diffusion-2-inpainting` (не устаревший runwayml)
- ✅ **Retry при загрузке модели** — 3 попытки с ожиданием 503
- ✅ **Touch-поддержка** — рисование пальцем на мобильном
- ✅ **Telegram уведомления** — мгновенная нотификация о заявке
- ✅ **Vercel KV** — хранение лидов в базе данных
- ✅ **Маска с градиентом** — плавные края зоны покрытия
- ✅ **4 типа покрытия** — асфальт, брусчатка, бетон, щебень
- ✅ **Скачать результат** — PNG с визуализацией

---

## Деплой на Vercel

### 1. Клонируй / распакуй проект

```bash
cd bel-dor-ai-v4
npm install
```

### 2. Настрой переменные окружения в Vercel Dashboard → Settings → Environment Variables

| Переменная | Описание | Обязательно |
|---|---|---|
| `HF_TOKEN` | HuggingFace API token (huggingface.co → Settings → Access Tokens) | ✅ Да |
| `TG_BOT_TOKEN` | Токен Telegram-бота от @BotFather | ⚡ Рекомендуется |
| `TG_CHAT_ID` | ID чата/канала куда слать заявки (узнай через @userinfobot) | ⚡ Рекомендуется |
| `KV_REST_API_URL` | Vercel KV URL (Dashboard → Storage → KV) | 🔸 Опционально |
| `KV_REST_API_TOKEN` | Vercel KV Token | 🔸 Опционально |

### 3. Задеплой

```bash
npx vercel --prod
```

---

## Как работает генерация

1. Пользователь загружает фото участка
2. Нажимает **"Автоопределить зону (ИИ)"** → Claude Vision рисует маску на зоне покрытия
3. При необходимости корректирует маску вручную кистью
4. Выбирает тип покрытия (асфальт / брусчатка / бетон / щебень)
5. Нажимает **"Визуализировать"** → Stable Diffusion inpainting заменяет зону
6. Скачивает результат или оставляет заявку

---

## Модель

**stabilityai/stable-diffusion-2-inpainting** (HuggingFace)

- Принимает: оригинал + бинарная маска (белое = перегенерировать, чёрное = сохранить)
- При первом запросе модель загружается ~20–60 сек → реализован retry с ожиданием
- Альтернатива: `runwayml/stable-diffusion-inpainting` (старее, но стабильнее при загрузке)

---

## Структура

```
bel-dor-ai-v4/
├── index.html          # SPA: загрузка, canvas, маска, генерация, лид-форма
├── api/
│   ├── generate.js     # Serverless: inpainting через HuggingFace
│   └── lead.js         # Serverless: сохранение лида + Telegram + KV
├── vercel.json         # Конфигурация Vercel
├── package.json
└── README.md
```

---

## Телефон и ссылки

Замени в `index.html`:
- `https://wa.me/79990000000` → твой номер WhatsApp
- `https://t.me/beldor_bot` → твой Telegram
- `https://bel-dor.ru` → твой сайт

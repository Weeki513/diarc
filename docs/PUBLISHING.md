# Публикация в Chrome Web Store

Dia ставит расширения из Chrome Web Store. Публикация бесплатная, кроме разового взноса **$5** за аккаунт разработчика.

## Перед первой загрузкой
1. Аккаунт: [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → оплатить $5, подтвердить email.
2. Заполнить `.env` (см. `.env.example`) Client ID Google и TickTick, если хотите, чтобы они работали «из коробки».
3. `npm run zip` → получится `diarc.zip`.

## Карточка в сторе
- Название, описание (RU/EN), категория **Productivity**.
- Иконка 128×128 (`public/icons/128.png`), минимум один скриншот 1280×800 (возьмите из `npm run test:e2e` → `test-results/`).
- **Privacy practices**:
  - Single purpose: «Командная строка поверх страницы для поиска по вкладкам, истории и закладкам и просмотра виджетов календаря, почты и задач».
  - Обоснование разрешений:
    - `tabs`, `history`, `bookmarks`, `favicon`, `search` — поиск и переключение вкладок, поиск по истории и закладкам, иконки сайтов, поиск в интернете.
    - `<all_urls>` и `scripting` — показ бара поверх любой открытой страницы (контент-скрипт) и запросы виджетов к API (Google, TickTick, Open-Meteo).
    - `storage`, `alarms` — кеш данных виджетов и их фоновое обновление.
    - `identity` — вход в Google и TickTick через OAuth.
  - Remote code: **No**.
  - Data usage: отметьте «Personal communications» (Gmail), «Personal information»/«Website content» по необходимости,
    подтвердите, что данные не продаются и не передаются третьим лицам. Ссылка на политику: опубликуйте `docs/PRIVACY.md`
    (например, через GitHub Pages: Settings → Pages → `main` / `docs`).
- Широкий доступ `<all_urls>` удлиняет ревью (обычно несколько дней). Это нормально.

## После первой загрузки
- Скопируйте Public key (Package → View public key) в `"key"` в `public/manifest.json`, чтобы ID распакованной версии совпадал со сторовой (важно для Redirect URI).
- Добавьте сторовый Redirect URI в Google и TickTick клиенты (см. `docs/OAUTH.md`).
- Для каждого обновления поднимайте `version` в `public/manifest.json` и `package.json`, затем `npm run zip`.

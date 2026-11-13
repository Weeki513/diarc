# Публикация в Chrome Web Store

Dia ставит расширения из Chrome Web Store. Публикация бесплатная, кроме разового взноса **$5** за аккаунт разработчика.

## Перед первой загрузкой
1. Аккаунт: [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → оплатить $5, подтвердить email.
2. Заполнить `.env` (см. `.env.example`) Client ID Google и TickTick, если хотите, чтобы они работали «из коробки».
3. `npm run zip` → получится `diarc.zip`. Скрипт убирает из манифеста поле `key` (оно нужно только для постоянного ID распакованной версии; стор назначает свой ID).

## Тексты для карточки

Короткое описание (поле Summary, до 132 символов):

- RU: `Командная строка как в Arc для Dia: ⌘T открывает поиск поверх страницы, а не новую вкладку. Виджеты, Tab-поиск, жидкое стекло.` (126)
- EN: `Arc-style command bar for Dia: ⌘T opens search over the current page, not a new tab. Widgets, Tab-to-search, liquid glass.` (122)

Полное описание (RU):

```
Diarc возвращает в Dia простоту Arc: по ⌘T поверх текущей страницы появляется строка поиска, а не новая вкладка.

Я долго ждал чего-то подобного от The Browser Company, устал ждать и сделал сам. Заодно добавил свободы (виджеты, которые легко дописывать) и немного красоты (ASCII-существа под жидким стеклом).

Что умеет:
• Поиск как в адресной строке: подсказки из интернета, открытые вкладки, закладки и история в одном списке. Выбранный вариант подсказывается прямо в строке, Tab или → принимает его.
• Tab-поиск по сайту как в Arc: «youtube» → Tab → запрос ищется на YouTube. Около 30 сайтов встроено, свои добавляются в настройках.
• Строка окрашивается в цвет сайта, который вы собираетесь открыть.
• Жидкое стекло: строка, плитки и подвал преломляют страницу у краёв, блик следует за курсором. Настраивается ползунками с превью.
• Плитки-виджеты как в iOS: Google Календарь, Gmail, TickTick, ссылки, погода и свои.
• Быстрое создание: «t купить молоко завтра» создаёт задачу, «e созвон в пятницу в 15:00» создаёт событие.
• Команды для вкладок: закрыть, закрепить, дублировать, закрыть дубликаты и другие.
• ASCII-существа (скаты, светлячки, ласточки, черепахи, листья) плавают по сайтам или во вкладке «Аквариум». Можно выключить или добавить своих.

Быстро и легко: контент-скрипт весит несколько килобайт и ничего не делает, пока бар закрыт. Бар живёт в изолированном фрейме расширения, страница не видит ни ваших данных, ни нажатий клавиш.

Сочетание по умолчанию ⌃⇧Space. Как сделать ⌘T через Karabiner-Elements, написано на GitHub.

Исходный код: https://github.com/Weeki513/diarc
```

Full description (EN):

```
Diarc brings Arc's simplicity back to Dia: ⌘T opens a search bar right over the page you're on instead of a new tab.

I waited a long time for something like this from The Browser Company, got tired of waiting and built it myself. Along the way I added some freedom (widgets that are easy to write) and a bit of beauty (ASCII creatures under liquid glass).

Features:
• Omnibox-style search: web suggestions, open tabs, bookmarks and history in one list. The selected item is ghost-completed in the input; Tab or → accepts it.
• Arc-style site search: type "youtube", press Tab, and your query goes to YouTube. About 30 sites built in, add your own in settings.
• The search bar takes on the color of the site you're about to open.
• Liquid glass: the bar, tiles and footer refract the page at their edges, with a light that follows your cursor. Tune it with sliders and a live preview.
• iOS-style widget tiles: Google Calendar, Gmail, TickTick, quick links, weather, and your own.
• Quick capture: "t buy milk tomorrow" creates a task, "e call friday 3pm" creates an event.
• Tab commands: close, pin, duplicate, close duplicates and more.
• ASCII creatures (mantas, fireflies, swallows, turtles, leaves) drift over pages or in an "Aquarium" tab. Turn them off or add your own.

Fast and light: the content script is a few kilobytes and does nothing while the bar is closed. The bar lives in an isolated extension frame, so pages can't see your data or keystrokes.

Default shortcut is Ctrl+Shift+Space. How to map it to ⌘T with Karabiner-Elements is on GitHub.

Source code: https://github.com/Weeki513/diarc
```

Скриншоты для карточки лежат в `docs/screenshots/`: home, search, tab-search, ghost, edit, dark и creatures уже 1280×800. Остальные стор не примет, их сначала нужно
дополнить полями до 1280×800.

## Карточка в сторе
- Название, описание (RU/EN), категория **Productivity**.
- Иконка 128×128 (`public/icons/128.png`), минимум один скриншот 1280×800 (см. `docs/screenshots/`).
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
- Добавьте Redirect URI сторовой версии (`https://<ID из стора>.chromiumapp.org/`) вторым адресом в клиенты Google и TickTick (см. `docs/OAUTH.md`).
- Если хотите, чтобы распакованная версия имела тот же ID, что и сторовая, замените `"key"` в `public/manifest.json` на Public key из Developer Dashboard (Package → View public key).
- Для каждого обновления поднимайте `version` в `public/manifest.json` и `package.json`, затем `npm run zip`.

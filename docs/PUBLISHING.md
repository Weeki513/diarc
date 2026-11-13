# Publishing to the Chrome Web Store

Dia installs extensions from the Chrome Web Store. Publishing is free apart from a one-time **$5** developer registration fee.

## Before the first upload
1. Account: [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → pay the $5, confirm your email.
2. Optionally fill in `.env` (see `.env.example`) with Google and TickTick Client IDs so they work out of the box.
3. `npm run zip` → produces `diarc.zip`. The script strips the `key` field from the manifest (it only pins the ID of the
   unpacked build; the store assigns its own ID).

## Listing texts

Short description (Summary field, up to 132 characters):

- RU: `Командная строка как в Arc для Dia: ⌘T открывает поиск поверх страницы, а не новую вкладку. Виджеты, Tab-поиск, жидкое стекло.` (126)
- EN: `Arc-style command bar for Dia: ⌘T opens search over the current page, not a new tab. Widgets, Tab-to-search, liquid glass.` (122)

Full description (Russian):

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

Full description (English):

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

Store screenshots are in `docs/screenshots/`: home, search, tab-search, ghost, edit, dark and creatures are already
1280×800. The store won't accept the others until they're padded to 1280×800.

## Store listing
- Name, description (EN/RU), category **Productivity**.
- Icon 128×128: `public/icons/128.png` (with the 16 px transparent margin the store asks for). At least one 1280×800
  screenshot (see `docs/screenshots/`).
- Large logo for promo tiles and social media: `assets/logo/diarc-512.png` (tile) and `assets/logo/source-sparkle.png`
  (sparkle only). Icons are rebuilt from the logo with `npm run icons`.
- **Privacy practices**:
  - Single purpose: "A command bar over the current page for searching tabs, history, bookmarks and the web, and viewing calendar, mail and task widgets."
  - Permission justifications:
    - `tabs`, `history`, `bookmarks`, `favicon`, `search`: searching and switching tabs, searching history and bookmarks, site icons, web search.
    - `<all_urls>` and `scripting`: showing the bar over any open page (content script) and widget requests to APIs (Google, TickTick, Open-Meteo).
    - `storage`, `alarms`: widget data cache and background refresh.
    - `identity`: signing in to Google and TickTick with OAuth.
  - Remote code: **No**.
  - Data usage: tick "Personal communications" (Gmail), and "Personal information" / "Website content" as needed;
    confirm that data is not sold or transferred to third parties. Privacy policy link: publish `docs/PRIVACY.md`
    (for example with GitHub Pages: Settings → Pages → `main` / `docs`).
- Broad `<all_urls>` access makes the review longer (usually a few days). That's normal.

## After the first upload
- Add the store version's Redirect URI (`https://<store ID>.chromiumapp.org/`) as a second address in the Google and TickTick clients (see `docs/OAUTH.md`).
- If you want the unpacked build to have the same ID as the store one, replace `"key"` in `public/manifest.json` with the Public key from the Developer Dashboard (Package → View public key).
- For every update, bump `version` in `public/manifest.json` and `package.json`, add a section to `CHANGELOG.md` (it is the release text), then run `npm run zip`.

# Diarc — Privacy Policy

_Last updated: 2026-11-13_

Diarc is a browser extension that shows a command bar with search and widgets.

**What data Diarc accesses.** Your open tabs, browsing history and bookmarks (to search them); and, only if you connect
them, your Google Calendar events, Gmail unread messages (sender, subject, short snippet) and TickTick tasks.

**Where it goes.** All data stays on your device, in the extension's local storage. Diarc talks directly to Google,
TickTick and Open-Meteo APIs from your browser. There is no Diarc server; nothing is sent to the developer or any
third party, and no analytics are collected. Search suggestions work like the browser's address bar: while you type in
the bar, the typed text is sent to the suggestion service you chose (Google by default, or DuckDuckGo); you can turn
suggestions off in settings. For site search (Tab), Diarc reads a site's public OpenSearch description when you visit it
and keeps only the site's search URL locally. Widget data is never inserted into web pages: the command bar runs in an
isolated extension frame that websites cannot read.

**Tokens.** OAuth access tokens are stored locally and used only to call the respective API. You can disconnect any
account in Diarc settings; uninstalling the extension deletes all stored data.

**Google API data.** Diarc's use of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the
Limited Use requirements.

Contact: open an issue at https://github.com/Weeki513/diarc/issues

# Настройка OAuth (Google и TickTick)

Это шаги, которые нужно сделать один раз руками: Google и TickTick не дают создавать OAuth-клиентов автоматически.
Без них работают поиск, «Быстрые ссылки», «Погода» и Gmail в простом режиме.

## 0. Узнайте Redirect URI

Откройте настройки Diarc (правый клик по иконке → «Параметры», или команда «Настройки Diarc» в баре).
Там есть поле **Redirect URI** вида `https://<id-расширения>.chromiumapp.org/`. Скопируйте его.

> ID расширения зависит от способа установки: у распакованной папки он один, у версии из Web Store другой.
> В один OAuth-клиент можно добавить оба URI. Чтобы ID распакованной версии совпадал с версией из Web Store,
> после первой загрузки в стор скопируйте «Public key» из Developer Dashboard (Package → View public key)
> в поле `"key"` файла `public/manifest.json`.

## 1. Google (Календарь и Gmail API)

1. Зайдите в [Google Cloud Console](https://console.cloud.google.com/) и создайте проект, например `Diarc`.
2. **APIs & Services → Library**: включите **Google Calendar API**. Для режима «Gmail API» включите и **Gmail API**.
3. **APIs & Services → OAuth consent screen** (в новой консоли: **Google Auth Platform**):
   - User type: **External**.
   - App name `Diarc`, support email, developer email.
   - **Data access / Scopes**: добавьте `.../auth/calendar.events`. Для Gmail API добавьте `.../auth/gmail.modify`.
   - **Audience → Test users**: добавьте свой Google-аккаунт. Пока приложение в режиме Testing, войти смогут только эти люди (до 100).
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application** (не «Chrome extension»: тот работает только с `getAuthToken`, которого в Dia нет).
   - **Authorized redirect URIs**: вставьте Redirect URI из шага 0.
   - Создайте и скопируйте **Client ID** (секрет не нужен).
5. Вставьте Client ID в настройки Diarc → «Google» → **Подключить**. Либо положите его в `.env` как `VITE_GOOGLE_CLIENT_ID`
   и пересоберите, тогда он будет вшит в сборку.

Токен Google живёт час и продлевается молча, пока вы залогинены в Google в этом браузере.

### Что нужно для публичного релиза
- `calendar.events` — **sensitive** scope. Чтобы им могли пользоваться все, а не только тестовые пользователи, нужна
  бесплатная верификация Google (Publishing status → **In production** → Prepare for verification): домашняя страница,
  политика конфиденциальности (`docs/PRIVACY.md` можно опубликовать через GitHub Pages), ролик на YouTube, где видно
  экран согласия и использование данных. Обычно занимает от нескольких дней до пары недель.
- `gmail.modify` (и вообще любые scope чтения Gmail) — **restricted**. Для публичного использования нужен платный аудит
  безопасности (CASA). Поэтому в публичной версии Gmail работает в **простом режиме** (Atom-лента Gmail с вашей
  сессией в браузере: без OAuth, только непрочитанные, только чтение), а режим «Gmail API» с архивом и «прочитано» —
  для тех, кто подключает свой собственный OAuth-клиент в режиме Testing.

## 2. TickTick

1. Зайдите на [developer.ticktick.com](https://developer.ticktick.com/) → **Manage Apps** → **+ App Name**.
2. В приложении нажмите **Edit**, в **OAuth redirect URL** вставьте Redirect URI из шага 0, сохраните.
3. Скопируйте **Client ID** и **Client Secret** в настройки Diarc → «TickTick» → **Подключить**.
   Для сборки: `VITE_TICKTICK_CLIENT_ID` и `VITE_TICKTICK_CLIENT_SECRET` в `.env`.

Токен TickTick живёт около 180 дней. Учтите: секрет, вшитый в публичное расширение, можно извлечь из пакета.
Для TickTick это обычная практика (другого способа у их API нет), но не используйте этот же клиент для чего-то ещё.

## Если что-то не так
- «redirect_uri_mismatch» — Redirect URI в консоли не совпадает с тем, что показан в настройках (проверьте `/` в конце).
- «access_denied» / «org_internal» — ваш аккаунт не добавлен в Test users.
- Плитка снова просит «Подключить» через час — значит, молчаливое продление не сработало (например, вы вышли из Google). Нажмите «Подключить» ещё раз.

# Подключение Google и TickTick: пошагово

Делается один раз, минут 15. Без этого уже работают поиск, ссылки, погода и Gmail в простом режиме.

**Redirect URI** (одинаковый для Google и TickTick):

```
https://lllpoldkalcfacagomdhjphhglmagikg.chromiumapp.org/
```

Он постоянный: ID расширения закреплён ключом `key` в `public/manifest.json`, поэтому не зависит от папки,
из которой вы загрузили расширение. Тот же адрес показан в настройках Diarc (кнопка «Копировать»).
У версии из Web Store будет другой ID: после публикации добавьте её Redirect URI вторым адресом (см. `docs/PUBLISHING.md`).

---

## Часть 1. Google (Календарь)

### 1.1 Проект
1. Откройте https://console.cloud.google.com/ и войдите тем аккаунтом Google, чей календарь нужен.
2. Вверху слева нажмите на выбор проекта → **New project**.
3. Project name: `Diarc` → **Create**. Дождитесь уведомления и выберите проект `Diarc` в том же меню.

### 1.2 Включить API
1. Откройте https://console.cloud.google.com/apis/library/calendar-json.googleapis.com → **Enable**.
2. Если нужен режим «Gmail API» (архив и «прочитано»): https://console.cloud.google.com/apis/library/gmail.googleapis.com → **Enable**. Можно пропустить.

### 1.3 Экран согласия
1. Откройте https://console.cloud.google.com/auth/overview → **Get started**.
2. **App information**: App name `Diarc`, User support email — ваш адрес → **Next**.
3. **Audience**: выберите **External** → **Next**.
4. **Contact information**: ваш адрес → **Next**.
5. Поставьте галочку согласия с политикой → **Continue** → **Create**.

### 1.4 Разрешения (scopes)
1. Слева **Data Access** → **Add or remove scopes**.
2. В поле фильтра вставьте `calendar.events`, отметьте строку `.../auth/calendar.events`.
3. Для Gmail API дополнительно отметьте `.../auth/gmail.modify` (можно пропустить).
4. **Update** → внизу страницы **Save**.

### 1.5 Тестовый пользователь
1. Слева **Audience** → блок **Test users** → **+ Add users**.
2. Впишите свой Gmail-адрес → **Save**.

Приложение остаётся в режиме Testing: им можете пользоваться вы и до 100 добавленных людей. Для всех остальных нужна верификация (`docs/PUBLISHING.md`).

### 1.6 Клиент OAuth
1. Слева **Clients** → **+ Create client**.
2. Application type: **Web application** (не «Chrome extension»: тот вариант в Dia не работает).
3. Name: `Diarc`.
4. **Authorized JavaScript origins** — ничего не добавляйте.
5. **Authorized redirect URIs** → **+ Add URI** → вставьте Redirect URI сверху (со слешем в конце).
6. **Create**. В окне скопируйте **Client ID** (`…apps.googleusercontent.com`). Client secret не нужен.

### 1.7 Подключить в Diarc
1. Правый клик по иконке Diarc → **Options** (или в баре наберите «Настройки Diarc» → ↵).
2. Раздел **Google** → поле **Client ID** → вставьте → кликните вне поля (сохранится, появится «Сохранено»).
3. **Подключить** → выберите аккаунт → на экране «Google hasn't verified this app» нажмите **Continue** → разрешите доступ.
4. Статус станет «Подключено». Откройте бар: плитка календаря заполнится.

Для режима Gmail API: в баре ▦ → шестерёнка на плитке Gmail → Режим «Gmail API» → Сохранить → «Подключить» на плитке.

---

## Часть 2. TickTick

1. Откройте https://developer.ticktick.com/ и войдите своим аккаунтом TickTick.
2. Справа вверху **Manage Apps** → **+ App Name**.
3. Name: `Diarc` → **Add**.
4. Нажмите на созданное приложение → **Edit**.
5. **OAuth redirect URL**: вставьте Redirect URI сверху → **Save**.
6. На этой же странице скопируйте **Client ID** и **Client Secret**.
7. Настройки Diarc → раздел **TickTick** → вставьте оба поля → **Подключить** → **Allow**.

Токен TickTick живёт около полугода, потом плитка попросит нажать «Подключить» снова.

---

## Если что-то не так
- **Error 400: redirect_uri_mismatch** — адрес в Google/TickTick не совпадает символ в символ. Проверьте `https://` и `/` в конце.
- **Error 403: access_denied** — ваш адрес не добавлен в Test users (шаг 1.5).
- **«Укажите Google Client ID в настройках»** — Client ID не сохранился: вставьте ещё раз и кликните вне поля.
- **Плитка через час снова просит «Подключить»** — молча продлить вход не получилось (например, вы вышли из Google в браузере). Нажмите «Подключить».

## Для сборки с вшитыми ключами
Чтобы не вводить ключи в настройках (например, для Web Store), скопируйте `.env.example` в `.env`, заполните
`VITE_GOOGLE_CLIENT_ID`, `VITE_TICKTICK_CLIENT_ID`, `VITE_TICKTICK_CLIENT_SECRET` и выполните `npm run build`.
Учтите, что секрет TickTick, вшитый в публичное расширение, можно извлечь из пакета.

## Почему Gmail по умолчанию без OAuth
Любой доступ к письмам через Gmail API (включая `gmail.modify`) Google считает **restricted** и для публичных приложений
требует платный аудит безопасности. Поэтому по умолчанию Gmail читает Atom-ленту непрочитанных через вашу обычную
сессию Gmail в браузере, а архив и «прочитано» доступны только с собственным OAuth-клиентом в режиме Testing.

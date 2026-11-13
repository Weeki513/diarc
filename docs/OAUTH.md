# Connecting Google and TickTick, step by step

You do this once; it takes about 15 minutes. Without it, search, links, weather and Gmail in simple mode already work.

The Diarc interface is in Russian, so button names are given as they appear, with a translation.

**Redirect URI** (the same for Google and TickTick):

```
https://lllpoldkalcfacagomdhjphhglmagikg.chromiumapp.org/
```

It never changes: the extension ID is pinned by the `key` field in `public/manifest.json`, so it doesn't depend on the
folder you loaded the extension from. Diarc settings show the same address (the **Копировать** / Copy button).
The Web Store version will have a different ID: after publishing, add its Redirect URI as a second address
(see `docs/PUBLISHING.md`).

---

## Part 1. Google (Calendar)

### 1.1 Project
1. Open https://console.cloud.google.com/ and sign in with the Google account whose calendar you want.
2. Click the project picker at the top left → **New project**.
3. Project name: `Diarc` → **Create**. Wait for the notification and select the `Diarc` project in the same menu.

### 1.2 Enable the APIs
1. Open https://console.cloud.google.com/apis/library/calendar-json.googleapis.com → **Enable**.
2. If you want the "Gmail API" mode (archive and mark as read): https://console.cloud.google.com/apis/library/gmail.googleapis.com → **Enable**. Optional.

### 1.3 Consent screen
1. Open https://console.cloud.google.com/auth/overview → **Get started**.
2. **App information**: App name `Diarc`, User support email: your address → **Next**.
3. **Audience**: choose **External** → **Next**.
4. **Contact information**: your address → **Next**.
5. Tick the policy checkbox → **Continue** → **Create**.

### 1.4 Scopes
1. On the left, **Data Access** → **Add or remove scopes**.
2. Paste `calendar.events` into the filter and tick the `.../auth/calendar.events` row.
3. For the Gmail API, also tick `.../auth/gmail.modify` (optional).
4. **Update** → **Save** at the bottom of the page.

### 1.5 Test user
1. On the left, **Audience** → **Test users** → **+ Add users**.
2. Enter your Gmail address → **Save**.

The app stays in Testing mode: you and up to 100 added people can use it. Everyone else would need verification (`docs/PUBLISHING.md`).

### 1.6 OAuth client
1. On the left, **Clients** → **+ Create client**.
2. Application type: **Web application** (not "Chrome extension": that option doesn't work in Dia).
3. Name: `Diarc`.
4. **Authorized JavaScript origins**: leave empty.
5. **Authorized redirect URIs** → **+ Add URI** → paste the Redirect URI from above (with the trailing slash).
6. **Create**. Copy the **Client ID** (`…apps.googleusercontent.com`) from the dialog. You don't need the client secret.

### 1.7 Connect it in Diarc
1. Right-click the Diarc icon → **Options** (or type "Настройки Diarc" in the bar → ↵).
2. **Google** section → **Client ID** field → paste → click outside the field (it saves and shows «Сохранено» / Saved).
3. **Подключить** (Connect) → choose your account → on the "Google hasn't verified this app" screen click **Continue** → allow access.
4. The status changes to «Подключено» (Connected). Open the bar: the calendar tile fills in.

For the Gmail API mode: in the bar, ▦ → gear on the Gmail tile → mode «Gmail API» → Save → **Подключить** on the tile.

---

## Part 2. TickTick

1. Open https://developer.ticktick.com/ and sign in with your TickTick account.
2. Top right, **Manage Apps** → **+ App Name**.
3. Name: `Diarc` → **Add**.
4. Click the new app → **Edit**.
5. **OAuth redirect URL**: paste the Redirect URI from above → **Save**.
6. On the same page, copy the **Client ID** and **Client Secret**.
7. Diarc settings → **TickTick** section → paste both → **Подключить** (Connect) → **Allow**.

The TickTick token lasts about six months; after that the tile asks you to press **Подключить** again.

---

## Troubleshooting
- **Error 400: redirect_uri_mismatch**: the address in Google/TickTick doesn't match character for character. Check `https://` and the trailing `/`.
- **Error 403: access_denied**: your address isn't in Test users (step 1.5).
- **«Укажите Google Client ID в настройках»** ("Set the Google Client ID in settings"): the Client ID wasn't saved. Paste it again and click outside the field.
- **The tile asks to connect again after an hour**: silent sign-in renewal failed (for example, you signed out of Google in the browser). Press **Подключить**.

## Building with embedded keys
To skip entering keys in settings (for example, for the Web Store), copy `.env.example` to `.env`, fill in
`VITE_GOOGLE_CLIENT_ID`, `VITE_TICKTICK_CLIENT_ID`, `VITE_TICKTICK_CLIENT_SECRET` and run `npm run build`.
Keep in mind that a TickTick secret embedded in a public extension can be extracted from the package.

## Why Gmail works without OAuth by default
Google treats any mail access through the Gmail API (including `gmail.modify`) as **restricted** and requires a paid
security audit for public apps. So by default Gmail reads the unread Atom feed through your regular Gmail session in the
browser, and archive and mark-as-read are only available with your own OAuth client in Testing mode.

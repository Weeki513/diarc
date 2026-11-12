# Writing Diarc widgets

> Для людей: этот файл написан как инструкция для AI-агента (Claude Code, Cursor и т.п.).
> Дайте агенту задачу вида «сделай виджет Diarc, который показывает …» и укажите на этот файл.

This document is the full contract for widgets. Follow it exactly; you should not need to read other code.

## 1. Anatomy

A widget is **one file**: `src/widgets/<id>/index.tsx`, default-exporting `defineWidget({...})`.
It is auto-registered at build time and appears in the bar's widget gallery (▦ → **+**).

```tsx
import { defineWidget } from '../../shared/widget';
import { Header, Row, Scroll, Empty, Big } from '../../ui/kit';

interface Data { items: { id: string; title: string; url: string }[] }
interface Config { query: string }

export default defineWidget<Data, Config>({
  id: 'hn',                         // kebab-case, MUST equal the folder name
  name: 'Hacker News',
  description: 'Top stories',
  icon: '🟧',                        // emoji (or inline SVG markup)
  sizes: ['S', 'M', 'L', 'XL'],      // allowed tile sizes
  defaultSize: 'L',
  refreshMinutes: 15,                // background refresh interval (default 10)
  settings: [{ key: 'query', label: 'Filter', type: 'text', default: '' }],

  async fetch(ctx) {                 // SERVICE WORKER: network allowed, no DOM
    const ids: number[] = await ctx.http('https://hacker-news.firebaseio.com/v0/topstories.json');
    const items = await Promise.all(ids.slice(0, 15).map((id) => ctx.http(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
    return { items: items.map((s) => ({ id: String(s.id), title: s.title, url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}` })) };
  },

  View({ data, size, open }) {       // OVERLAY: Preact component, no network
    const items = data?.items ?? [];
    if (size === 'S') return <div class="k-pad"><Header title="HN" icon="🟧" /><Big>{items[0]?.title}</Big></div>;
    return (
      <div class="k-pad k-col">
        <Header title="Hacker News" icon="🟧" onClick={() => open('https://news.ycombinator.com')} />
        <Scroll>
          {items.length === 0 && <Empty>Nothing</Empty>}
          {items.map((it) => <Row key={it.id} title={it.title} onClick={() => open(it.url)} />)}
        </Scroll>
      </div>
    );
  },
});
```

Scaffold with `npm run new-widget -- <id> "<Name>"`, then `npm run typecheck && npm run build`, and reload the
extension (`dia://extensions` → ↻). Then open the bar → ▦ → **+** → pick the widget.

## 2. Execution model (important)

| Part | Runs in | Can | Cannot |
|---|---|---|---|
| `fetch(ctx)` | background service worker | network via `ctx.http`, auth, `ctx.store` | DOM, `window`, `DOMParser`, `localStorage` |
| `actions[name](ctx, payload)` | background service worker | same as fetch | same |
| `commands[].run(ctx, text)` | background service worker | same as fetch | same |
| `View(props)` | overlay page (extension iframe) | render, call `run`, `open`, `refresh` | direct network calls, `ctx` |

- `fetch` returns **plain JSON** (no `Date`, `Map`, class instances). Store dates as ISO strings.
- The result is cached in `chrome.storage.local` under `cache:<tileId>` and rendered **instantly** next time the
  bar opens, then refreshed in the background (every `refreshMinutes`, and on open if older than 60 s).
- Keep data small (< 100 KB per tile). Trim lists; don't store HTML bodies.
- Each tile is an *instance*: the same widget can be added several times with different `config`.

## 3. API reference

### `defineWidget<Data, Config>(def)`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | kebab-case, equals folder name |
| `name`, `description`, `icon` | `string` | shown in gallery and headers |
| `sizes` | `('S'\|'M'\|'L'\|'XL')[]` | S = 1×1, M = 2×1, L = 2×2, XL = 4×2 cells on a 4-column grid; a cell is ~165×150 px; lists must scroll (use `<Scroll>`), never cut items |
| `defaultSize` | size | used when added |
| `auth?` | `{ provider: 'google' \| 'ticktick', scopes?: string[] }` or `(config) => that \| undefined` | the tile shows a «Подключить» button automatically when auth is missing |
| `refreshMinutes?` | `number` | default 10 |
| `settings?` | `WidgetSetting[]` | rendered as a form in edit mode (gear icon) |
| `fetch?` | `(ctx) => Promise<Data>` | omit for static widgets (see `links`) |
| `actions?` | `Record<string, (ctx, payload) => Promise<unknown>>` | mutations; data auto-refreshes after each |
| `commands?` | `WidgetCommand[]` | command-bar prefixes, e.g. typing `t buy milk` |
| `View` | Preact component | see props below |

### `WidgetSetting`
`{ key, label, type: 'text' | 'textarea' | 'number' | 'toggle' | 'select', options?: {value,label}[], default?, placeholder?, help? }`
Values arrive merged with defaults in `ctx.config` and `props.config`.
For a `select` whose choices depend on the user's account (lists, calendars), add
`loadOptions: async (ctx) => [{ value, label }]` to the setting: it runs in the service worker when the settings form opens
(see the `scope` setting of `ticktick`).

### `ctx` (service worker side)
```ts
ctx.instanceId: string
ctx.config: Config
ctx.http<T>(url, { method?, headers?, json?, as?: 'json'|'text'|'none', auth?: {provider, scopes?}, ...RequestInit }): Promise<T>
  // - adds `Authorization: Bearer` when `auth` is set, retries once on 401 with a fresh token
  // - throws AuthRequiredError (tile shows «Подключить») or HttpError(status, message)
ctx.token({provider, scopes?}): Promise<string>   // raw token if you need it
ctx.store.get(key) / ctx.store.set(key, value)    // small persistent per-tile KV (cursors, etags)
```
The extension has `<all_urls>` host permission, so `ctx.http` can call any HTTPS API without CORS issues.
Parse XML/HTML with regex or string ops (no `DOMParser` in service workers; see `gmail` for an Atom example).

### View props
```ts
data: Data | undefined     // cached data (undefined only before the first successful fetch)
config: Config
size: 'S' | 'M' | 'L' | 'XL'
loading: boolean           // a background refresh is in flight (data is still the cached one)
updatedAt?: number
run(action, payload?): Promise<unknown>   // calls actions[action] in the SW; rejects with the error message
refresh(): void            // force refresh
open(url, { newTab? }): void              // switches to an existing tab with that URL, else opens one; closes the bar
```
The frame around the View already handles: loading skeleton, auth/connect state, errors with retry, edit mode
(remove, resize, settings). Your View only renders data.

**Render every allowed size.** Tile heights are fixed; content must fit or scroll inside `<Scroll>`.
Typical pattern: `S` → one big number or line (`<Big>`), `M` → 2–3 compact rows, `L`/`XL` → full list + `<AddInput>`.

### UI kit (`src/ui/kit.tsx`)
Use these; they follow light/dark themes.

| Component | Use |
|---|---|
| `<div class="k-pad">` / `<div class="k-pad k-col">` | tile padding / vertical layout (put `<Scroll>` in the middle, `<AddInput>` at the bottom) |
| `Header({ title, icon?, right?, onClick? })` | small uppercase title row |
| `Scroll` | scrollable area that fills remaining height |
| `Group({ label })` | labelled section ("Сегодня") |
| `Row({ title, subtitle?, meta?, leading?, actions?, onClick?, active?, muted? })` | list row; `actions` appear on hover |
| `IconButton({ title, onClick, danger? })` + icons (`IconTrash`, `IconPencil`, `IconArchive`, `IconMailOpen`, `IconCheck`, `IconPlus`, `IconExternal`, …) | row actions |
| `Check({ checked, onChange, color? })` | task checkbox |
| `AddInput({ placeholder, onSubmit: (text) => Promise })` | "add item" field; shows spinner/error |
| `EditableText({ value, editing, onSave, onCancel })` | inline rename |
| `Big({ children, sub? })` | large number/line for small tiles |
| `Empty({ icon?, children })` | empty state |
| `Dot({ color? })` | colour bar |
| `useOptimistic()` → `{ hidden, hide(id), restore(id) }` | hide an item instantly, restore if the action fails |

Helpers: `src/shared/dates.ts` (`parseWhen` RU/EN natural language dates, `fmtTime`, `fmtDayLabel`, `fmtRelative`, `fmtShort`),
`useTick(ms)` from `src/ui/hooks.ts` to re-render relative times.

Custom CSS: add rules to `src/ui/styles.css` scoped as `.tile-<id> …`. Use CSS variables
(`--text`, `--text-2`, `--text-3`, `--accent`, `--bg-2`, `--line`, `--hover`, `--danger`).

### Actions & optimistic UI
```tsx
actions: {
  async complete(ctx, p: { id: string }) {
    await ctx.http(`https://api.example.com/tasks/${p.id}/complete`, { method: 'POST', auth: AUTH, as: 'none' });
  },
},
View({ data, run }) {
  const { hidden, hide, restore } = useOptimistic();
  const done = (id: string) => { hide(id); run('complete', { id }).catch(() => restore(id)); };
  …
}
```
Errors thrown in actions are shown as a toast automatically.

### Commands (typing in the bar)
```ts
commands: [{
  id: 'create',
  title: 'Новая задача',                 // shown as «Новая задача: «<text>»»
  prefix: ['t', 'task', 'з'],            // "t buy milk tomorrow" → run(ctx, 'buy milk tomorrow')
  hint: 'TickTick',
  run: async (ctx, text) => { …; return 'Задача создана'; }, // returned string → toast
}]
```
Commands use the config of the first tile of this widget in the layout (or defaults if none).

### Auth
Only `google` and `ticktick` providers exist (`src/background/auth.ts`). For Google, list exact scopes; they are
merged with already granted ones (incremental consent). Prefer the narrowest scope. Restricted Google scopes
(Gmail read/modify, Drive full) require a paid security audit for public release — avoid them in widgets meant
for the Web Store.

A new provider (e.g. Notion, GitHub): add a branch in `getToken()` in `src/background/auth.ts` using
`chrome.identity.launchWebAuthFlow` with `chrome.identity.getRedirectURL()` as redirect URI, add the id to
`AuthProviderId` in `src/shared/widget.ts`, add client id fields to `Settings` and the options page.
For APIs with personal tokens, prefer a `settings` field of type `text` instead of OAuth.

## 4. Checklist before you finish
- [ ] `id` equals folder name; file is `src/widgets/<id>/index.tsx` with a default export.
- [ ] `fetch` returns JSON-serialisable, small data; dates are ISO strings.
- [ ] Every size in `sizes` renders sensibly (no overflow; long text truncates).
- [ ] Network only in `fetch`/`actions`/`commands`, via `ctx.http`.
- [ ] Strings shown to the user are Russian.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] No new permissions in the manifest, no remote scripts.

## 5. Examples in this repo
- `weather` — public API, settings, two sizes. **Start here.**
- `links` — no `fetch`, config-only.
- `ticktick` — OAuth, actions (complete, rename, delete), optimistic UI, a prefix command.
- `calendar` — Google OAuth, inline editor form, natural-language creation.
- `gmail` — two modes (`auth` as a function of config), Atom/XML parsing in the service worker.

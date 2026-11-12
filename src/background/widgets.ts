/** Runs widget fetch/actions/commands in the service worker and maintains the data cache. */
import { widgets } from '../widgets/registry';
import { getLayout, K, type CacheEntry, type Tile } from '../shared/storage';
import {
  AuthRequiredError,
  HttpError,
  defaultConfig,
  resolveAuth,
  type HttpOptions,
  type WidgetContext,
  type WidgetDefinition,
} from '../shared/widget';
import { getToken, invalidate } from './auth';

const DEFAULT_REFRESH_MIN = 10;
const inflight = new Map<string, Promise<void>>();

function makeContext(tile: Tile, def: WidgetDefinition): WidgetContext {
  const config = { ...defaultConfig(def), ...tile.config };
  return {
    instanceId: tile.id,
    config,
    token: (auth) => getToken(auth),
    http: (url, opts) => http(url, opts),
    store: {
      async get(key) {
        const r = await chrome.storage.local.get(K.store(tile.id));
        return ((r[K.store(tile.id)] ?? {}) as Record<string, any>)[key];
      },
      async set(key, value) {
        const r = await chrome.storage.local.get(K.store(tile.id));
        await chrome.storage.local.set({ [K.store(tile.id)]: { ...(r[K.store(tile.id)] ?? {}), [key]: value } });
      },
    },
  };
}

export async function http<T = any>(url: string, opts: HttpOptions = {}): Promise<T> {
  const { auth, as = 'json', json, ...init } = opts;
  const headers = new Headers(init.headers);
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    headers.set('Content-Type', 'application/json');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (auth) headers.set('Authorization', `Bearer ${await getToken(auth, false, attempt > 0)}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 && auth) {
      if (attempt === 0) {
        await invalidate(auth.provider);
        continue;
      }
      throw new AuthRequiredError(auth.provider);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = body.slice(0, 200);
      try {
        msg = JSON.parse(body).error?.message ?? JSON.parse(body).errorMessage ?? msg;
      } catch {}
      throw new HttpError(res.status, `HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
    }
    if (as === 'none' || res.status === 204) return undefined as T;
    if (as === 'text') return (await res.text()) as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  throw new Error('unreachable');
}

async function readCache(id: string): Promise<CacheEntry> {
  const r = await chrome.storage.local.get(K.cache(id));
  return (r[K.cache(id)] as CacheEntry) ?? {};
}
async function writeCache(id: string, entry: CacheEntry): Promise<void> {
  await chrome.storage.local.set({ [K.cache(id)]: entry });
}

export async function refreshTile(tile: Tile, force = false, maxAgeMs?: number): Promise<void> {
  const def = widgets.get(tile.widget);
  if (!def?.fetch) return;
  const running = inflight.get(tile.id);
  if (running) return running;
  const prev = await readCache(tile.id);
  const maxAge = maxAgeMs ?? (def.refreshMinutes ?? DEFAULT_REFRESH_MIN) * 60_000;
  if (!force && prev.updatedAt && Date.now() - prev.updatedAt < maxAge && !prev.error && !prev.needsAuth) return;

  const p = (async () => {
    await writeCache(tile.id, { ...prev, fetching: true });
    try {
      const data = await def.fetch!(makeContext(tile, def));
      await writeCache(tile.id, { data, updatedAt: Date.now() });
    } catch (e) {
      const err = e as Error;
      await writeCache(tile.id, {
        ...prev,
        fetching: false,
        error: err.message,
        needsAuth: e instanceof AuthRequiredError ? e.provider : undefined,
      });
    }
  })().finally(() => inflight.delete(tile.id));
  inflight.set(tile.id, p);
  return p;
}

/** Refresh every tile whose data is older than its own interval (or `maxAgeMs`). */
export async function refreshStale(maxAgeMs?: number, ids?: string[], force = false): Promise<void> {
  const layout = await getLayout();
  await Promise.all(layout.filter((t) => !ids || ids.includes(t.id)).map((t) => refreshTile(t, force, maxAgeMs)));
}

export async function runAction(id: string, action: string, payload: unknown): Promise<unknown> {
  const tile = (await getLayout()).find((t) => t.id === id);
  if (!tile) throw new Error(`Виджет ${id} не найден`);
  const def = widgets.get(tile.widget);
  const fn = def?.actions?.[action];
  if (!def || !fn) throw new Error(`Действие ${action} не найдено`);
  const result = await fn(makeContext(tile, def), payload);
  refreshTile(tile, true);
  return result;
}

export async function runCommand(widgetId: string, commandId: string, text: string): Promise<string | void> {
  const def = widgets.get(widgetId);
  const cmd = def?.commands?.find((c) => c.id === commandId);
  if (!def || !cmd) throw new Error('Команда не найдена');
  const layout = await getLayout();
  const tile = layout.find((t) => t.widget === widgetId) ?? { id: `${widgetId}-cmd`, widget: widgetId, size: def.defaultSize, config: {} };
  const result = await cmd.run(makeContext(tile, def), text);
  if (layout.includes(tile)) refreshTile(tile, true);
  return result;
}

export function authFor(tile: Tile) {
  const def = widgets.get(tile.widget);
  return def ? resolveAuth(def, { ...defaultConfig(def), ...tile.config }) : undefined;
}

/** Drop cache entries of tiles that are no longer in the layout. */
export async function pruneCache(): Promise<void> {
  const ids = new Set((await getLayout()).map((t) => t.id));
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter(
    (k) => (k.startsWith('cache:') || k.startsWith('store:')) && !ids.has(k.slice(k.indexOf(':') + 1)),
  );
  if (stale.length) await chrome.storage.local.remove(stale);
}

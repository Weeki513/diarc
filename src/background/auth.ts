/**
 * OAuth for the service worker.
 * - Google: implicit flow via chrome.identity.launchWebAuthFlow (getAuthToken does not work in Dia).
 *   Tokens live ~1h and are renewed silently (prompt=none) while the Google session is alive.
 * - TickTick: authorization-code flow; tokens live ~180 days.
 * Setup of the OAuth clients is described in docs/OAUTH.md.
 */
import { AuthRequiredError, type AuthProviderId, type AuthRequirement } from '../shared/widget';
import { getSettings, K } from '../shared/storage';

interface StoredToken {
  token: string;
  expiresAt: number;
  scopes?: string[];
}

const inflight = new Map<string, Promise<string>>();

async function load(provider: AuthProviderId): Promise<StoredToken | undefined> {
  const r = await chrome.storage.local.get(K.auth(provider));
  return r[K.auth(provider)] as StoredToken | undefined;
}
async function save(provider: AuthProviderId, t: StoredToken | undefined): Promise<void> {
  if (t) await chrome.storage.local.set({ [K.auth(provider)]: t });
  else await chrome.storage.local.remove(K.auth(provider));
}

export function redirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

/** Returns a valid access token or throws AuthRequiredError. */
export async function getToken(req: AuthRequirement, interactive = false, forceRefresh = false): Promise<string> {
  const key = `${req.provider}:${interactive}:${forceRefresh}:${(req.scopes ?? []).join(',')}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (req.provider === 'google' ? google(req.scopes ?? [], interactive, forceRefresh) : ticktick(interactive, forceRefresh)).finally(() =>
    inflight.delete(key),
  );
  inflight.set(key, p);
  return p;
}

async function google(scopes: string[], interactive: boolean, forceRefresh: boolean): Promise<string> {
  const stored = await load('google');
  const have = new Set(stored?.scopes ?? []);
  const covered = scopes.every((s) => have.has(s));
  if (stored && covered && !forceRefresh && stored.expiresAt - 60_000 > Date.now()) return stored.token;

  const { googleClientId } = await getSettings();
  if (!googleClientId) throw new AuthRequiredError('google', 'Укажите Google Client ID в настройках Diarc');
  // Silent renewal is only possible for scopes the user already granted.
  if (!interactive && (!stored || !covered)) throw new AuthRequiredError('google');

  const wanted = [...new Set([...(stored?.scopes ?? []), ...scopes])];
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', googleClientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', redirectUrl());
  url.searchParams.set('scope', wanted.join(' '));
  url.searchParams.set('include_granted_scopes', 'true');
  if (!interactive) url.searchParams.set('prompt', 'none');

  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: url.toString(),
      interactive,
      abortOnLoadForNonInteractive: false,
      timeoutMsForNonInteractive: 8000,
    });
  } catch (e) {
    throw new AuthRequiredError('google', interactive ? `Google: ${(e as Error).message}` : undefined);
  }
  const params = new URLSearchParams(new URL(responseUrl!).hash.slice(1));
  const token = params.get('access_token');
  if (!token) throw new AuthRequiredError('google', params.get('error') ?? undefined);
  const granted = (params.get('scope') ?? wanted.join(' ')).split(/\s+/).filter(Boolean);
  await save('google', {
    token,
    expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000,
    scopes: [...new Set([...granted, ...wanted.filter((s) => granted.includes(s))])],
  });
  if (!scopes.every((s) => granted.includes(s))) {
    throw new AuthRequiredError('google', 'Google не выдал нужные разрешения, попробуйте подключить ещё раз');
  }
  return token;
}

async function ticktick(interactive: boolean, forceRefresh: boolean): Promise<string> {
  const stored = await load('ticktick');
  if (stored && !forceRefresh && stored.expiresAt - 60_000 > Date.now()) return stored.token;
  if (!interactive) throw new AuthRequiredError('ticktick');

  const { tickTickClientId, tickTickClientSecret } = await getSettings();
  if (!tickTickClientId || !tickTickClientSecret) {
    throw new AuthRequiredError('ticktick', 'Укажите TickTick Client ID и Secret в настройках Diarc');
  }
  const state = crypto.randomUUID();
  const url = new URL('https://ticktick.com/oauth/authorize');
  url.searchParams.set('client_id', tickTickClientId);
  url.searchParams.set('scope', 'tasks:read tasks:write');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', redirectUrl());
  url.searchParams.set('response_type', 'code');

  // TickTick's sign-in page fails inside the launchWebAuthFlow window ("Authorization page could not
  // be loaded"), so authorize in a normal tab and catch the redirect to chromiumapp.org instead.
  const responseUrl = await authorizeInTab(url.toString(), redirectUrl()).catch((e: Error) => {
    throw new AuthRequiredError('ticktick', `TickTick: ${e.message}`);
  });
  const q = new URL(responseUrl).searchParams;
  if (q.get('state') !== state || !q.get('code')) throw new AuthRequiredError('ticktick', 'TickTick не вернул код авторизации');

  const res = await fetch('https://ticktick.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${tickTickClientId}:${tickTickClientSecret}`),
    },
    body: new URLSearchParams({
      code: q.get('code')!,
      grant_type: 'authorization_code',
      scope: 'tasks:read tasks:write',
      redirect_uri: redirectUrl(),
    }),
  });
  if (!res.ok) throw new AuthRequiredError('ticktick', `TickTick: ошибка ${res.status} при получении токена`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  await save('ticktick', { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 15_552_000) * 1000 });
  return json.access_token;
}

export async function invalidate(provider: AuthProviderId): Promise<void> {
  const stored = await load(provider);
  if (stored) await save(provider, { ...stored, expiresAt: 0 });
}

export async function disconnect(provider: AuthProviderId): Promise<void> {
  const stored = await load(provider);
  if (provider === 'google' && stored?.token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.token)}`, { method: 'POST' }).catch(() => {});
  }
  await save(provider, undefined);
}

export async function status(): Promise<Record<AuthProviderId, { connected: boolean; scopes?: string[] }>> {
  const [g, t] = await Promise.all([load('google'), load('ticktick')]);
  return {
    google: { connected: !!g?.scopes?.length, scopes: g?.scopes },
    ticktick: { connected: !!t && t.expiresAt > Date.now() },
  };
}

/**
 * OAuth in a regular browser tab: opens `url`, waits until the tab navigates to `redirect`,
 * closes it and returns that URL. Uses the user's existing session on the provider's site.
 */
function authorizeInTab(url: string, redirect: string, timeoutMs = 5 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let tabId: number | undefined;
    // Extension API calls keep the service worker alive while the user signs in.
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
    const timer = setTimeout(() => done(new Error('время ожидания входа истекло')), timeoutMs);
    const done = (err: Error | null, result?: string) => {
      clearInterval(keepAlive);
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
      tabId = undefined;
      err ? reject(err) : resolve(result!);
    };
    const onUpdated = (id: number, info: { url?: string }, tab: chrome.tabs.Tab) => {
      const u = info.url ?? tab.pendingUrl ?? tab.url;
      if (id === tabId && u?.startsWith(redirect)) done(null, u);
    };
    const onRemoved = (id: number) => {
      if (id === tabId) {
        tabId = undefined;
        done(new Error('окно входа закрыто'));
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.create({ url, active: true }).then((t) => (tabId = t.id), (e) => done(e));
  });
}

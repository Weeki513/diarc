/**
 * Diarc widget API. See docs/WIDGETS.md for the full guide.
 *
 * A widget is ONE file: src/widgets/<id>/index.tsx with `export default defineWidget({...})`.
 * - `fetch` and `actions` run in the background service worker (network, auth, no DOM).
 * - `View` runs in the command bar overlay (Preact component, no network: call `run()` instead).
 * Data returned by `fetch` is cached in chrome.storage.local and rendered instantly on open.
 */
import type { ComponentType } from 'preact';

export type TileSize = 'S' | 'M' | 'L' | 'XL';

/** Grid spans [columns, rows] on the 4-column tile grid. */
export const SIZE_SPANS: Record<TileSize, [number, number]> = {
  S: [1, 1],
  M: [2, 1],
  L: [2, 2],
  XL: [4, 2],
};

export const SIZE_LABELS: Record<TileSize, string> = { S: 'Маленький', M: 'Средний', L: 'Большой', XL: 'Широкий' };

export type AuthProviderId = 'google' | 'ticktick';

export interface AuthRequirement {
  provider: AuthProviderId;
  /** OAuth scopes (Google only). */
  scopes?: string[];
}

export interface WidgetSetting {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'toggle' | 'select';
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
  placeholder?: string;
  help?: string;
}

export interface HttpOptions extends RequestInit {
  /** Attach a bearer token from this provider. On 401 the token is refreshed once. */
  auth?: AuthRequirement;
  /** Response parsing. Default 'json'. */
  as?: 'json' | 'text' | 'none';
  /** JSON body shortcut (sets Content-Type). */
  json?: unknown;
}

/** Context passed to `fetch`, `actions` and `commands` (service worker side). */
export interface WidgetContext<C = Record<string, any>> {
  instanceId: string;
  config: C;
  /** fetch() wrapper: auth headers, JSON parsing, error mapping. Throws AuthRequiredError / HttpError. */
  http<T = any>(url: string, options?: HttpOptions): Promise<T>;
  /** Get an access token (non-interactive). Throws AuthRequiredError if the user must connect. */
  token(auth: AuthRequirement): Promise<string>;
  /** Small per-instance key/value store (persisted). */
  store: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
}

/** Props of a widget's View (overlay side). */
export interface WidgetViewProps<D = any, C = Record<string, any>> {
  data: D | undefined;
  config: C;
  size: TileSize;
  /** True while a background refresh is running. Cached `data` is still shown. */
  loading: boolean;
  updatedAt?: number;
  /** Run one of the widget's `actions` in the service worker. Data refreshes afterwards. */
  run(action: string, payload?: unknown): Promise<unknown>;
  refresh(): void;
  /** Open a URL: switches to an existing tab with that URL if there is one. */
  open(url: string, opts?: { newTab?: boolean }): void;
}

/** A command bar command contributed by a widget, e.g. `t Buy milk` → create task. */
export interface WidgetCommand<C = Record<string, any>> {
  id: string;
  title: string;
  /** Typing `<prefix> <text>` in the bar runs this command with <text>. */
  prefix: string[];
  /** Hint shown under the title, e.g. "Создать задачу в TickTick". */
  hint?: string;
  run(ctx: WidgetContext<C>, text: string): Promise<string | void>;
}

export interface WidgetDefinition<D = any, C = Record<string, any>> {
  /** Unique, kebab-case. Must match the folder name. */
  id: string;
  name: string;
  description: string;
  /** Emoji or inline SVG markup. */
  icon: string;
  /** Allowed tile sizes, in the order they cycle in edit mode. */
  sizes: TileSize[];
  defaultSize: TileSize;
  /** Auth needed for fetch/actions. A function lets config switch it (e.g. Gmail lite mode needs none). */
  auth?: AuthRequirement | ((config: C) => AuthRequirement | undefined);
  /** Background refresh interval. Default 10. Data also refreshes on open if older than 60s. */
  refreshMinutes?: number;
  settings?: WidgetSetting[];
  fetch?(ctx: WidgetContext<C>): Promise<D>;
  actions?: Record<string, (ctx: WidgetContext<C>, payload: any) => Promise<unknown>>;
  View: ComponentType<WidgetViewProps<D, C>>;
  commands?: WidgetCommand<C>[];
}

export function defineWidget<D = any, C = Record<string, any>>(def: WidgetDefinition<D, C>): WidgetDefinition<D, C> {
  return def;
}

export class AuthRequiredError extends Error {
  constructor(public provider: AuthProviderId, message = 'Нужно подключить аккаунт') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function resolveAuth<C>(def: WidgetDefinition<any, C>, config: C): AuthRequirement | undefined {
  return typeof def.auth === 'function' ? def.auth(config) : def.auth;
}

export function defaultConfig(def: WidgetDefinition): Record<string, any> {
  const out: Record<string, any> = {};
  for (const s of def.settings ?? []) if (s.default !== undefined) out[s.key] = s.default;
  return out;
}

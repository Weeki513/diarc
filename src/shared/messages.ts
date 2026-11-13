/** Messages sent to the background service worker via chrome.runtime.sendMessage. */
export type BgRequest =
  | { type: 'widget:refresh'; ids?: string[]; force?: boolean }
  | { type: 'widget:action'; id: string; action: string; payload?: unknown }
  | { type: 'widget:options'; id: string; key: string }
  | { type: 'widget:command'; widget: string; command: string; text: string }
  | { type: 'auth:connect'; provider: 'google' | 'ticktick'; scopes?: string[] }
  | { type: 'auth:disconnect'; provider: 'google' | 'ticktick' }
  | { type: 'auth:status' }
  | { type: 'overlay:closed' }
  | { type: 'engine:found'; href: string };

export type BgResponse<T = unknown> = { ok: true; result?: T } | { ok: false; error: string; needsAuth?: string };

export async function bg<T = unknown>(msg: BgRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(msg)) as BgResponse<T> | undefined;
  if (!res) throw new Error('Нет ответа от фонового процесса');
  if (!res.ok) {
    const err = new Error(res.error) as Error & { needsAuth?: string };
    err.needsAuth = res.needsAuth;
    throw err;
  }
  return res.result as T;
}

/** postMessage protocol between the content script (page) and the overlay iframe. */
export type FrameMsg =
  | { diarc: 'open'; text?: string }
  | { diarc: 'hide' }
  | { diarc: 'ready' }
  | { diarc: 'close' };

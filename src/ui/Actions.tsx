/**
 * ⌘K action menu (like Raycast): a small glass popover with searchable actions.
 * Context actions for the selected result come first, then quick toggles (creatures, glass,
 * theme, suggestions), then Diarc itself (settings, Aquarium, tiles, accounts).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bg } from '../shared/messages';
import { DEFAULT_AMBIENT, saveSettings, type Settings } from '../shared/storage';
import { closeBar, openUrl } from './env';
import type { Result } from './search';

export interface Action {
  id: string;
  section: string;
  title: string;
  icon: string;
  keywords?: string;
  /** Shown on the right: a state ("вкл") or a shortcut. */
  hint?: string;
  /** Marks the current choice in a group (glass mode, theme…). */
  on?: boolean;
  /** Keep the menu open after running (toggles you may want to flip again). */
  stay?: boolean;
  run(): unknown;
}

interface Props {
  settings: Settings;
  result?: Result;
  query: string;
  newTabDefault: boolean;
  onClose(): void;
  toast(msg: string): void;
  editTiles(): void;
  addTile(): void;
  refreshWidgets(): void;
  removeResult(r: Result): void;
  closeTabResult(r: Result): void;
  activate(r: Result, mods: { shift?: boolean }): void;
}

const SPECIES_ICON: Record<string, string> = { manta: '◈', fireflies: '✦', swallows: '⌃', turtles: '⬢', leaves: '❦' };

export function ActionMenu(p: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [species, setSpecies] = useState<{ id: string; name: string }[]>([]);
  const [auth, setAuth] = useState<Record<'google' | 'ticktick', { connected: boolean }> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Take focus before the next keystroke lands in the search field.
  useLayoutEffect(() => input.current?.focus(), []);
  useEffect(() => {
    // Loaded on demand so the bar itself doesn't carry the creature sprites.
    import('../ambient/registry').then(({ creatures, creatureIds }) => setSpecies(creatureIds().map((id) => ({ id, name: creatures.get(id)!.name }))));
    bg<Record<'google' | 'ticktick', { connected: boolean }>>({ type: 'auth:status' }).then(setAuth).catch(() => {});
  }, []);

  const s = p.settings;
  const amb = { ...DEFAULT_AMBIENT, ...s.ambient };
  const ambient = (patch: Partial<typeof amb>) => saveSettings({ ambient: { ...amb, ...patch } });

  const actions = useMemo<Action[]>(() => {
    const out: Action[] = [];
    const r = p.result;
    if (r && p.query) {
      const sec = r.kind === 'tab' ? 'Вкладка' : r.url ? 'Ссылка' : 'Результат';
      out.push({ id: 'r-open', section: sec, title: r.kind === 'tab' ? 'Перейти' : 'Открыть', icon: '↵', hint: '↵', run: () => p.activate(r, {}) });
      if (r.kind !== 'tab' && r.kind !== 'command' && r.kind !== 'widget-command')
        out.push({ id: 'r-other', section: sec, title: p.newTabDefault ? 'Открыть в этой вкладке' : 'Открыть в новой вкладке', icon: '⇧', hint: '⇧↵', run: () => p.activate(r, { shift: true }) });
      if (r.url) {
        out.push({ id: 'r-copy', section: sec, title: 'Скопировать ссылку', icon: '🔗', run: async () => { await navigator.clipboard.writeText(r.url!); p.toast('Ссылка скопирована'); } });
        out.push({ id: 'r-copy-md', section: sec, title: 'Скопировать как Markdown', icon: 'Ⓜ', run: async () => { await navigator.clipboard.writeText(`[${r.title}](${r.url})`); p.toast('Скопировано'); } });
        out.push({ id: 'r-window', section: sec, title: 'Открыть в новом окне', icon: '▢', run: async () => { closeBar(); await chrome.windows.create({ url: r.url, focused: true }); } });
      }
      if (r.kind === 'history') out.push({ id: 'r-forget', section: sec, title: 'Удалить из истории', icon: '⌫', hint: '⇧⌫', run: () => p.removeResult(r) });
      if (r.kind === 'suggest' || r.kind === 'nav') out.push({ id: 'r-hide', section: sec, title: 'Убрать из подсказок', icon: '⌫', hint: '⇧⌫', run: () => p.removeResult(r) });
      if (r.kind === 'tab') {
        out.push({ id: 'r-close', section: sec, title: 'Закрыть вкладку', icon: '✕', hint: '⌘⌫', run: () => p.closeTabResult(r) });
        out.push({ id: 'r-pin', section: sec, title: r.tab?.pinned ? 'Открепить вкладку' : 'Закрепить вкладку', icon: '📌', run: () => chrome.tabs.update(r.tab!.id!, { pinned: !r.tab!.pinned }) });
      }
    }

    const on = amb.show !== 'off';
    out.push({ id: 'amb-toggle', section: 'Существа', title: on ? 'Выключить существ' : 'Включить существ', icon: on ? '◌' : '●', keywords: 'ascii creatures ambient анимации существа', hint: on ? 'вкл' : 'выкл', stay: true, run: () => ambient({ show: on ? 'off' : 'bar' }) });
    out.push({ id: 'amb-always', section: 'Существа', title: amb.show === 'always' ? 'Показывать только с баром' : 'Показывать на сайтах всегда', icon: '◎', keywords: 'ascii always всегда фон', stay: true, run: () => ambient({ show: amb.show === 'always' ? 'bar' : 'always' }) });
    for (const sp of species)
      out.push({ id: `amb-${sp.id}`, section: 'Существа', title: sp.name, icon: SPECIES_ICON[sp.id] ?? '◇', keywords: `ascii creature ${sp.id}`, on: on && amb.species === sp.id, stay: true, run: () => ambient({ species: sp.id, show: on ? amb.show : 'bar' }) });
    out.push({ id: 'aquarium', section: 'Существа', title: 'Открыть «Аквариум»', icon: '🐠', keywords: 'aquarium ascii', run: () => openUrl(chrome.runtime.getURL('ambient.html?mode=tab')) });

    const glass = s.glass ?? 'liquid';
    for (const [v, t, i] of [['liquid', 'Жидкое стекло', '💧'], ['frost', 'Матовое стекло', '❄'], ['off', 'Без стекла', '▭']] as const)
      out.push({ id: `glass-${v}`, section: 'Стекло', title: t, icon: i, keywords: 'glass liquid стекло', on: glass === v, stay: true, run: () => saveSettings({ glass: v }) });

    for (const [v, t, i] of [['system', 'Тема как в системе', '◐'], ['light', 'Светлая тема', '☀'], ['dark', 'Тёмная тема', '☾']] as const)
      out.push({ id: `theme-${v}`, section: 'Тема', title: t, icon: i, keywords: 'theme тема dark light', on: s.theme === v, stay: true, run: () => saveSettings({ theme: v }) });

    const sug = s.suggest ?? 'google';
    for (const [v, t] of [['google', 'Подсказки Google'], ['duckduckgo', 'Подсказки DuckDuckGo'], ['off', 'Без подсказок из интернета']] as const)
      out.push({ id: `sug-${v}`, section: 'Поиск', title: t, icon: '⌕', keywords: 'suggestions подсказки поиск', on: sug === v, stay: true, run: () => saveSettings({ suggest: v }) });
    out.push({ id: 'newtab', section: 'Поиск', title: p.newTabDefault ? 'Открывать в этой вкладке по ↵' : 'Открывать в новой вкладке по ↵', icon: '⇄', keywords: 'new tab enter вкладка', stay: true, run: () => saveSettings({ openInNewTab: !p.newTabDefault }) });

    out.push({ id: 'tiles-edit', section: 'Diarc', title: 'Изменить плитки', icon: '▦', keywords: 'widgets tiles edit виджеты', run: p.editTiles });
    out.push({ id: 'tiles-add', section: 'Diarc', title: 'Добавить виджет', icon: '＋', keywords: 'widget add виджет', run: p.addTile });
    out.push({ id: 'tiles-refresh', section: 'Diarc', title: 'Обновить виджеты', icon: '⟳', keywords: 'refresh', run: () => { p.refreshWidgets(); p.toast('Обновляю…'); } });
    for (const [prov, name] of [['google', 'Google'], ['ticktick', 'TickTick']] as const) {
      const c = auth?.[prov]?.connected;
      if (!auth) continue;
      out.push({
        id: `auth-${prov}`, section: 'Diarc', title: c ? `Выйти из ${name}` : `Подключить ${name}`, icon: c ? '⎋' : '🔑', keywords: 'account login logout аккаунт вход выход',
        hint: c ? 'подключено' : undefined,
        run: async () => {
          try {
            if (c) await bg({ type: 'auth:disconnect', provider: prov });
            else await bg({ type: 'auth:connect', provider: prov, scopes: prov === 'google' ? ['https://www.googleapis.com/auth/calendar.events'] : undefined });
            p.toast(c ? `${name} отключён` : `${name} подключён`);
            p.refreshWidgets();
          } catch (e) {
            p.toast((e as Error).message);
          }
        },
      });
    }
    out.push({ id: 'settings', section: 'Diarc', title: 'Настройки Diarc', icon: '⚙', keywords: 'settings preferences настройки', hint: '⌘,', run: async () => { closeBar(); await chrome.runtime.openOptionsPage(); } });
    out.push({ id: 'shortcuts', section: 'Diarc', title: 'Сочетание клавиш', icon: '⌨', keywords: 'shortcut hotkey клавиши', run: () => openUrl('chrome://extensions/shortcuts') });
    return out;
  }, [p.result, p.query, s, species, auth]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return actions;
    const words = t.split(/\s+/);
    return actions.filter((a) => {
      const hay = `${a.title} ${a.section} ${a.keywords ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [actions, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.act.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = async (a: Action | undefined) => {
    if (!a) return;
    if (!a.stay) p.onClose();
    await a.run();
    if (a.stay) input.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    const n = shown.length;
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); setSel((x) => (n ? (x + 1) % n : 0)); }
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); setSel((x) => (n ? (x - 1 + n) % n : 0)); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(shown[sel]); }
    else if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); e.stopPropagation(); p.onClose(); }
    else if (e.key === 'Backspace' && !q) { e.preventDefault(); p.onClose(); }
    else if (e.key === 'Tab') e.preventDefault();
  };

  let last = '';
  return (
    <div class="actions glass" role="menu" onMouseDown={(e) => e.stopPropagation()}>
      <div class="act-list" ref={list}>
        {shown.length === 0 && <div class="act-empty">Ничего не найдено</div>}
        {shown.map((a, i) => {
          const head = a.section !== last ? ((last = a.section), <div class="act-sec" key={`s-${a.section}`}>{a.section}</div>) : null;
          return [
            head,
            <div key={a.id} class={`act ${i === sel ? 'sel' : ''} ${a.on ? 'on' : ''}`} onMouseMove={() => i !== sel && setSel(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => run(a)}>
              <span class="act-icon">{a.icon}</span>
              <span class="act-title">{a.title}</span>
              {a.on && <span class="act-check">✓</span>}
              {a.hint && <span class="act-hint">{a.hint}</span>}
            </div>,
          ];
        })}
      </div>
      <input ref={input} class="act-input" value={q} placeholder="Поиск действий…" autocomplete="off" spellcheck={false} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={onKey} />
    </div>
  );
}

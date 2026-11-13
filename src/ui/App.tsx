import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bg } from '../shared/messages';
import { builtinCommands } from './commands';
import { MODE, TAB_ORIGIN, closeBar, favicon, focusTab, looksLikeUrl, openUrl, setCloser, webSearch } from './env';
import { useSnapshot, type Snapshot } from './hooks';
import { asyncResults, rank, syncResults, type Result } from './search';
import { cachedSuggestions, webSuggestions } from './suggest';
import { isLight, siteTint } from './tint';
import { BUILTIN_ENGINES, engineUrl, matchEngine, type Engine } from '../shared/engines';
import { Grid } from './Grid';
import { startGlassReporter, startLight } from './glass';
import { Gallery, TileSettings } from './Panels';
import { IconBolt, IconClock, IconGlobe, IconGrid, IconSearch, IconStar, IconTab, IconX } from './icons';

type Panel = null | { type: 'gallery' } | { type: 'settings'; id: string };

const KIND_LABEL: Record<string, string> = {
  tab: 'Вкладка',
  bookmark: 'Закладка',
  history: 'История',
  command: 'Команда',
  'widget-command': 'Создать',
  url: 'Открыть',
  search: 'Поиск',
  suggest: 'Поиск',
  nav: 'Сайт',
};

export function App(props: { initial: Snapshot }) {
  const snap = useSnapshot(props.initial);
  const [visible, setVisible] = useState(MODE !== 'frame');
  const [query, setQuery] = useState('');
  // Tab-to-search: the site the query is scoped to ("youtube" + Tab).
  const [scope, setScope] = useState<Engine | null>(null);
  const [autoEngines, setAutoEngines] = useState<Engine[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [sel, setSel] = useState(0);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [edit, setEdit] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchToken = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshWidgets = useCallback(() => bg({ type: 'widget:refresh', force: true }).catch(() => {}), []);
  const commands = useMemo(() => builtinCommands({ editWidgets: () => { setQuery(''); setEdit(true); }, refreshWidgets }), [refreshWidgets]);

  const loadTabs = useCallback(async () => {
    const all = await chrome.tabs.query({ windowType: 'normal' });
    all.sort((a, b) => ((b as any).lastAccessed ?? 0) - ((a as any).lastAccessed ?? 0));
    setTabs(all);
  }, []);

  const reset = useCallback((text = '') => {
    setQuery(text);
    setScope(null);
    chrome.storage.local.get('engines:auto').then((r) => setAutoEngines(Object.values((r['engines:auto'] ?? {}) as Record<string, Engine>)));
    setSel(0);
    setEdit(false);
    setPanel(null);
  }, []);

  // ---- open / close lifecycle ----
  useEffect(() => {
    setCloser(() => {
      if (MODE === 'frame') {
        setVisible(false);
        parent.postMessage({ diarc: 'close' }, '*');
      } else if (MODE === 'window' || MODE === 'popup') window.close();
      else if (MODE === 'tab') {
        chrome.tabs.getCurrent().then((t) => {
          if (t?.id === undefined) return;
          if (TAB_ORIGIN === 'replace') chrome.tabs.goBack(t.id).catch(() => chrome.tabs.remove(t.id!));
          else chrome.tabs.remove(t.id);
        });
      }
    });
    loadTabs();
    if (MODE === 'frame') {
      const onMsg = (e: MessageEvent) => {
        if (e.source !== parent) return;
        if (e.data?.diarc === 'open') {
          reset(e.data.text ?? '');
          setVisible(true);
          loadTabs();
          requestAnimationFrame(() => {
            input.current?.focus();
            document.querySelector('.grid-wrap')?.scrollTo(0, 0);
            glass?.kick();
          });
        } else if (e.data?.diarc === 'viewport') {
          document.documentElement.style.setProperty('--page-h', `${e.data.h}px`);
        } else if (e.data?.diarc === 'hide') {
          setVisible(false);
          reset();
        }
      };
      window.addEventListener('message', onMsg);
      // Tell the content script how tall the panel is, so the iframe covers only the panel.
      const panel = document.querySelector('.panel');
      const ro = new ResizeObserver(() => {
        const h = (panel as HTMLElement | null)?.offsetHeight ?? 0;
        parent.postMessage({ diarc: 'size', h: h + 40 + 90 }, '*');
      });
      if (panel) ro.observe(panel);
      const glass = panel ? startGlassReporter(panel as HTMLElement) : null;
      startLight();
      parent.postMessage({ diarc: 'ready' }, '*');
      return () => {
        window.removeEventListener('message', onMsg);
        glass?.stop();
      };
    }
    if (MODE === 'tab') document.title = 'Diarc';
    if (MODE === 'popup' || MODE === 'tab') bg({ type: 'widget:refresh' }).catch(() => {});
    if (MODE === 'window') {
      bg({ type: 'widget:refresh' }).catch(() => {});
      const onBlur = () => setTimeout(() => !document.hasFocus() && window.close(), 150);
      window.addEventListener('blur', onBlur);
      return () => window.removeEventListener('blur', onBlur);
    }
  }, []);

  useLayoutEffect(() => {
    if (visible) input.current?.focus();
  }, [visible]);

  // ---- search ----
  useEffect(() => {
    const token = ++searchToken.current;
    const provider = snap.settings.suggest ?? 'google';
    if (scope) {
      const q = query.trim();
      const head: Result[] = q ? [{ key: 'search', kind: 'search', title: q, subtitle: `Искать на ${scope.name}`, score: 0 }] : [];
      const scoped = (w: Result[]) => [...head, ...w.filter((r) => r.kind === 'suggest' && r.title.toLowerCase() !== q.toLowerCase()).slice(0, 7)];
      setResults(scoped(cachedSuggestions(provider, q, scope.ds) ?? []));
      setSel(0);
      if (q) webSuggestions(provider, q, scope.ds).then((w) => token === searchToken.current && setResults(scoped(w)));
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const sync = syncResults(query, tabs, commands);
    let local = sync;
    let web = cachedSuggestions(provider, query) ?? [];
    const update = () => token === searchToken.current && setResults(rank(query, local, web));
    update();
    setSel(0);
    asyncResults(query).then((more) => {
      local = [...sync, ...more];
      update();
    });
    // Skip the network for widget commands ("t купить молоко") and typed URLs.
    if (!web.length && !sync.some((r) => r.kind === 'widget-command') && !looksLikeUrl(query)) {
      webSuggestions(provider, query).then((w) => {
        web = w;
        update();
      });
    }
  }, [query, tabs, commands, scope]);

  useEffect(() => {
    listRef.current?.querySelector('.res.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  // Arc-style: tint the search pill with the selected site's colour.
  const [tint, setTint] = useState<string | null>(null);
  const tintUrl = scope ? engineUrl(scope, '') : query ? results[sel]?.url : undefined;
  useEffect(() => {
    let live = true;
    const { now, later } = siteTint(tintUrl);
    if (now !== undefined) setTint(now);
    later?.then((c) => live && setTint(c));
    return () => {
      live = false;
    };
  }, [tintUrl]);

  const activate = async (r: Result | undefined, mods: { shift?: boolean } = {}) => {
    if (!r) return;
    const newTab = snap.settings.openInNewTab !== !!mods.shift;
    try {
      switch (r.kind) {
        case 'tab':
          return await focusTab(r.tab!);
        case 'url':
        case 'nav':
        case 'bookmark':
        case 'history':
          return await openUrl(r.url!, newTab);
        case 'search':
        case 'suggest': {
          const text = r.kind === 'search' ? query.trim() : r.title;
          if (scope) return await openUrl(engineUrl(scope, text), newTab);
          return await webSearch(text, newTab);
        }
        case 'command': {
          const msg = await r.command!.run();
          if (typeof msg === 'string') {
            setQuery('');
            if (msg) showToast(msg);
          }
          return;
        }
        case 'widget-command': {
          const { widget, command, text } = r.widgetCommand!;
          setQuery('');
          showToast('…');
          const msg = await bg<string | undefined>({ type: 'widget:command', widget, command, text });
          showToast(msg ? `✓ ${msg}` : '✓ Готово');
          return;
        }
      }
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const closeTabResult = async (r: Result) => {
    if (r.kind !== 'tab' || !r.tab?.id) return;
    await chrome.tabs.remove(r.tab.id);
    setTabs((t) => t.filter((x) => x.id !== r.tab!.id));
  };

  const engines = useMemo(() => [...(snap.settings.engines ?? []), ...BUILTIN_ENGINES, ...autoEngines], [snap.settings.engines, autoEngines]);
  const candidate = !scope && query ? matchEngine(query, engines) : null;

  const onInputKey = (e: KeyboardEvent) => {
    const n = results.length;
    if (e.key === 'Tab') {
      // Tab never moves focus out of the field: it only starts site search.
      e.preventDefault();
      if (candidate && !e.shiftKey) {
        setScope(candidate);
        setQuery('');
      }
      return;
    }
    if (e.key === 'Backspace' && scope && !query) {
      e.preventDefault();
      setScope(null);
      return;
    }
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      setSel((s) => (n ? (s + 1) % n : 0));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      setSel((s) => (n ? (s - 1 + n) % n : 0));
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      activate(results[sel], { shift: e.shiftKey });
    } else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey) && results[sel]?.kind === 'tab') {
      e.preventDefault();
      closeTabResult(results[sel]);
    }
  };

  // Global keys: Escape steps back; typing anywhere focuses the search field.
  // State is read through a ref so fast repeated presses never see a stale closure.
  const live = useRef({ panel, edit, scope });
  live.current = { panel, edit, scope };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = target !== input.current && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      const cur = live.current;
      if (e.key === 'Tab' && target !== input.current && !target.closest?.('.sheet')) {
        // Keep keyboard focus in the search field instead of walking through buttons.
        e.preventDefault();
        if (!inField) input.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (inField) {
          target.blur();
          input.current?.focus();
        } else if (cur.scope) {
          live.current = { ...cur, scope: null };
          setScope(null);
          setQuery('');
        } else if (cur.panel) {
          live.current = { ...cur, panel: null };
          setPanel(null);
        } else if (cur.edit) {
          live.current = { ...cur, edit: false };
          setEdit(false);
        } else closeBar();
        return;
      }
      if (!inField && target !== input.current && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !cur.panel) input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const themeAttr = snap.settings.theme === 'system' ? undefined : snap.settings.theme;
  return (
    <div
      class={`root mode-${MODE} ${visible ? 'shown' : ''}`}
      data-theme={themeAttr}
      data-glass={snap.settings.glass ?? 'liquid'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && MODE === 'frame') closeBar();
      }}
    >
      <div class="panel" role="dialog" aria-label="Diarc">
        <div class={`bar glass ${tint ? (isLight(tint) ? 'tinted on-light' : 'tinted') : ''}`} style={tint ? { '--site': tint } : undefined}>
          <span class="bar-icon"><IconSearch size={18} /></span>
          {scope && (
            <button class="bar-scope" title="Backspace — отменить" onClick={() => { setScope(null); input.current?.focus(); }}>
              {scope.name}
            </button>
          )}
          <input
            class={scope ? 'scoped' : ''}
            ref={input}
            value={query}
            placeholder={scope ? `Искать на ${scope.name}` : 'Поиск, URL или команда'}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={onInputKey}
          />
          {candidate && (
            <span class="bar-hint"><kbd>Tab</kbd> {candidate.name}</span>
          )}
          {!query && !scope && (
            <button class={`bar-btn ${edit ? 'on' : ''}`} title={edit ? 'Готово' : 'Изменить виджеты'} onClick={() => { setEdit(!edit); setPanel(null); }}>
              {edit ? 'Готово' : <IconGrid size={16} />}
            </button>
          )}
          {query && (
            <button class="bar-btn" title="Очистить" onClick={() => { setQuery(''); input.current?.focus(); }}>
              <IconX size={14} />
            </button>
          )}
        </div>

        {query || scope ? (
          <div class="results glass" ref={listRef}>
            {scope && !query && <div class="res-empty">Введите запрос: Enter откроет результаты на {scope.name}. Backspace — обычный поиск.</div>}
            {results.map((r, i) => (
              <div
                key={r.key}
                class={`res ${i === sel ? 'sel' : ''}`}
                onMouseMove={() => i !== sel && setSel(i)}
                onClick={(e) => activate(r, { shift: e.shiftKey })}
              >
                <span class="res-icon"><ResultIcon r={r} /></span>
                <span class="res-text">
                  <span class="res-title">{r.title}</span>
                  {r.subtitle && <span class="res-sub">{r.subtitle}</span>}
                </span>
                {r.kind === 'tab' && (
                  <button class="res-close" title="Закрыть вкладку (⌘⌫)" onClick={(e) => { e.stopPropagation(); closeTabResult(r); }}>
                    <IconX size={12} />
                  </button>
                )}
                <span class="res-kind">{i === sel ? (r.kind === 'tab' ? 'Перейти ↵' : `${KIND_LABEL[r.kind]} ↵`) : KIND_LABEL[r.kind]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div class={`home ${panel ? 'has-sheet' : ''}`}>
            <Grid
              layout={snap.layout}
              cache={snap.cache}
              edit={edit}
              setEdit={setEdit}
              openGallery={() => setPanel({ type: 'gallery' })}
              openSettings={(id) => setPanel({ type: 'settings', id })}
              onToast={showToast}
            />
            {panel?.type === 'gallery' && <Gallery layout={snap.layout} onClose={() => setPanel(null)} />}
            {panel?.type === 'settings' && <TileSettings layout={snap.layout} id={panel.id} onClose={() => setPanel(null)} />}
          </div>
        )}

        <div class="foot glass">
          {query || scope ? (
            <>
              {candidate && <span><kbd>Tab</kbd> искать на {candidate.name}</span>}
              <span><kbd>↑</kbd><kbd>↓</kbd> выбор</span>
              <span><kbd>↵</kbd> {snap.settings.openInNewTab ? 'новая вкладка' : 'эта вкладка'}</span>
              <span><kbd>⇧</kbd><kbd>↵</kbd> {snap.settings.openInNewTab ? 'эта вкладка' : 'новая вкладка'}</span>
              <span><kbd>⌘</kbd><kbd>⌫</kbd> закрыть вкладку</span>
            </>
          ) : (
            <>
              <span><kbd>t</kbd> задача</span>
              <span><kbd>e</kbd> событие</span>
              <span>{edit ? 'Перетаскивайте плитки, меняйте размер' : 'Долгое нажатие на плитку — редактирование'}</span>
            </>
          )}
          <span class="foot-right"><kbd>esc</kbd></span>
        </div>
        {toast && <div class="toast">{toast}</div>}
      </div>
    </div>
  );
}

function ResultIcon({ r }: { r: Result }) {
  if (r.kind === 'command' || r.kind === 'widget-command') return <span class="emoji">{r.icon ?? <IconBolt />}</span>;
  if (r.kind === 'search' || r.kind === 'suggest') return <IconSearch size={16} />;
  if (r.url) {
    const fallback = r.kind === 'tab' ? <IconTab /> : r.kind === 'bookmark' ? <IconStar /> : r.kind === 'history' ? <IconClock /> : <IconGlobe />;
    return (
      <>
        <img src={favicon(r.url)} alt="" width={16} height={16} onError={(e) => (e.target as HTMLElement).remove()} />
        <span class="res-icon-fallback">{fallback}</span>
      </>
    );
  }
  return <IconGlobe />;
}

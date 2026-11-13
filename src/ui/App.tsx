import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bg } from '../shared/messages';
import { DEFAULT_GLASS_TUNE, type GlassTune } from '../shared/storage';
import { builtinCommands } from './commands';
import { MODE, TAB_ORIGIN, closeBar, favicon, focusTab, looksLikeUrl, openUrl, setCloser, webSearch } from './env';
import { useSnapshot, type Snapshot } from './hooks';
import { asyncResults, prettyUrl, rank, syncResults, type Result } from './search';
import { cachedSuggestions, hideSuggestion, visibleSuggestions, webSuggestions } from './suggest';
import { isLight, siteTint } from './tint';
import { BUILTIN_ENGINES, engineUrl, matchEngine, type Engine } from '../shared/engines';
import { Grid } from './Grid';
import { startGlassReporter, startLight } from './glass';
import { Gallery, TileSettings } from './Panels';
import { ActionMenu } from './Actions';
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
  const [menu, setMenu] = useState(false);
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
    setMenu(false);
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
            light.wave();
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
      const light = startLight();
      parent.postMessage({ diarc: 'ready' }, '*');
      return () => {
        window.removeEventListener('message', onMsg);
        glass?.stop();
      };
    }
    if (MODE === 'tab') document.title = 'Diarc';
    // Outside a page (Dia new tab, popup, window) the creatures live in the bar's own page,
    // behind the glass. Loaded lazily so the in-page bar doesn't carry the engine.
    if ((snap.settings.ambient?.show ?? 'bar') !== 'off') {
      import('../ambient/engine').then(({ Ambient }) => {
        const c = document.createElement('canvas');
        c.className = 'ambient-bg';
        document.querySelector('.root')?.prepend(c);
        const amb = new Ambient(c);
        amb.configure(snap.settings.ambient ?? {});
        amb.start();
        window.addEventListener('pointermove', (e) => amb.pointer(e.clientX, e.clientY), { passive: true });
        window.addEventListener('click', (e) => (e.target as HTMLElement) === c || (e.target as HTMLElement).classList.contains('root') ? amb.scatter(e.clientX, e.clientY) : 0);
        chrome.storage.onChanged.addListener((ch, area) => {
          if (area === 'local' && ch.settings) amb.configure((ch.settings.newValue as { ambient?: object })?.ambient ?? {});
        });
      });
    }
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
      const scoped = (w: Result[]) => [...head, ...visibleSuggestions(w).filter((r) => r.kind === 'suggest' && r.title.toLowerCase() !== q.toLowerCase()).slice(0, 7)];
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
    const update = () => token === searchToken.current && setResults(rank(query, local, visibleSuggestions(web)));
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

  /** × on a row: forget a history entry or hide a web suggestion, right away. */
  const removable = (r: Result) => r.kind === 'history' || r.kind === 'suggest' || r.kind === 'nav';
  const removeResult = async (r: Result) => {
    if (!removable(r)) return;
    setResults((cur) => cur.filter((x) => x.key !== r.key));
    input.current?.focus();
    if (r.kind === 'history') {
      await chrome.history.deleteUrl({ url: r.url! }).catch(() => {});
      hideSuggestion({ ...r, kind: 'nav' }); // the suggestion service may still offer the same page
    } else hideSuggestion(r);
  };

  const closeTabResult = async (r: Result) => {
    if (r.kind !== 'tab' || !r.tab?.id) return;
    await chrome.tabs.remove(r.tab.id);
    setTabs((t) => t.filter((x) => x.id !== r.tab!.id));
  };

  const engines = useMemo(() => [...(snap.settings.engines ?? []), ...BUILTIN_ENGINES, ...autoEngines], [snap.settings.engines, autoEngines]);
  const candidate = !scope && query ? matchEngine(query, engines) : null;

  // Ghost completion: the selected row's text, shown dimmer after what was typed.
  // Arrow keys show it for any row; the top row shows it only when it continues the typed text.
  const [arrowed, setArrowed] = useState(false);
  const completion = (() => {
    const r = results[sel];
    if (!r || !query) return '';
    const text = r.kind === 'search' ? '' : r.url && r.kind !== 'tab' ? prettyUrl(r.url) : r.title;
    if (!text || text.toLowerCase() === query.toLowerCase()) return '';
    if (text.toLowerCase().startsWith(query.toLowerCase())) return text;
    return arrowed ? text : '';
  })();
  const ghostRest = completion.toLowerCase().startsWith(query.toLowerCase()) ? completion.slice(query.length) : completion ? `  →  ${completion}` : '';
  const accept = () => {
    if (!completion) return false;
    setQuery(completion);
    setArrowed(false);
    return true;
  };

  const onInputKey = (e: KeyboardEvent) => {
    const n = results.length;
    if (e.key === 'Tab') {
      // Tab never moves focus out of the field: it starts site search ("youtube" + Tab)
      // or accepts the suggested completion.
      e.preventDefault();
      if (e.shiftKey) return;
      if (candidate && !arrowed) {
        setScope(candidate);
        setQuery('');
      } else accept();
      return;
    }
    const el = e.target as HTMLInputElement;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (e.key === 'ArrowRight' && atEnd && completion) {
      e.preventDefault();
      accept();
      return;
    }
    if (e.key === 'ArrowLeft') setArrowed(false); // drop the ghost, move the caret as usual
    if (e.key === 'Backspace' && scope && !query) {
      e.preventDefault();
      setScope(null);
      return;
    }
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      setArrowed(true);
      setSel((s) => (n ? (s + 1) % n : 0));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      setArrowed(true);
      setSel((s) => (n ? (s - 1 + n) % n : 0));
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      activate(results[sel], { shift: e.shiftKey });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey && results[sel] && removable(results[sel])) {
      e.preventDefault();
      removeResult(results[sel]);
    } else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey) && results[sel]?.kind === 'tab') {
      e.preventDefault();
      closeTabResult(results[sel]);
    }
  };

  // Global keys: Escape steps back; typing anywhere focuses the search field.
  // State is read through a ref so fast repeated presses never see a stale closure.
  const live = useRef({ panel, edit, scope, menu });
  live.current = { panel, edit, scope, menu };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = target !== input.current && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      const cur = live.current;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        // ⌘K: Raycast-style action menu.
        e.preventDefault();
        live.current = { ...cur, menu: !cur.menu };
        setMenu(!cur.menu);
        if (cur.menu) input.current?.focus();
        return;
      }
      if (e.metaKey && e.key === ',') {
        e.preventDefault();
        closeBar();
        chrome.runtime.openOptionsPage();
        return;
      }
      if (e.key === 'Tab' && target !== input.current && !target.closest?.('.sheet')) {
        // Keep keyboard focus in the search field instead of walking through buttons.
        e.preventDefault();
        if (!inField) input.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (cur.menu) {
          live.current = { ...cur, menu: false };
          setMenu(false);
          input.current?.focus();
        } else if (inField) {
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
      if (!inField && target !== input.current && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !cur.panel && !cur.menu) input.current?.focus();
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
      style={tuneVars(snap.settings.glassTune)}
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
          <div class={`bar-field ${scope ? 'scoped' : ''}`}>
          {ghostRest && (
            <div class="bar-ghost" aria-hidden="true"><span class="ghost-typed">{query}</span><span class="ghost-rest">{ghostRest}</span></div>
          )}
          <input
            class={scope ? 'scoped' : ''}
            ref={input}
            value={query}
            placeholder={scope ? `Искать на ${scope.name}` : 'Поиск, URL или команда'}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => { setArrowed(false); setQuery((e.target as HTMLInputElement).value); }}
            onKeyDown={onInputKey}
          />
          </div>
          {candidate && !(arrowed && completion) && (
            <span class="bar-hint"><kbd>Tab</kbd> {candidate.name}</span>
          )}
          {arrowed && completion && <span class="bar-hint"><kbd>Tab</kbd> дополнить</span>}
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
                {removable(r) && (
                  <button class="res-close" title="Убрать из подсказок (⇧⌫)" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); removeResult(r); }}>
                    <IconX size={12} />
                  </button>
                )}
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
              {candidate && !(arrowed && completion) && <span><kbd>Tab</kbd> искать на {candidate.name}</span>}
              {!candidate && <span><kbd>↑</kbd><kbd>↓</kbd> выбор</span>}
              <span><kbd>↵</kbd> {snap.settings.openInNewTab ? 'новая вкладка' : 'эта вкладка'}</span>
              <span><kbd>⇧</kbd><kbd>↵</kbd> {snap.settings.openInNewTab ? 'эта вкладка' : 'новая вкладка'}</span>
              {results[sel]?.kind === 'tab' && <span><kbd>⌘</kbd><kbd>⌫</kbd> закрыть вкладку</span>}
            </>
          ) : (
            <>
              <span><kbd>t</kbd> задача</span>
              <span><kbd>e</kbd> событие</span>
              <span>{edit ? 'Перетаскивайте плитки, меняйте размер' : 'Долгое нажатие на плитку — редактирование'}</span>
            </>
          )}
          <button class={`foot-actions ${menu ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setMenu(!menu); if (menu) input.current?.focus(); }}>
            Действия <kbd>⌘</kbd><kbd>K</kbd>
          </button>
          <span class="foot-right"><kbd>esc</kbd></span>
        </div>
        {menu && (
          <ActionMenu
            settings={snap.settings}
            result={query || scope ? results[sel] : undefined}
            query={query}
            newTabDefault={snap.settings.openInNewTab}
            onClose={() => { setMenu(false); input.current?.focus(); }}
            toast={showToast}
            editTiles={() => { setQuery(''); setScope(null); setPanel(null); setEdit(true); }}
            addTile={() => { setQuery(''); setScope(null); setEdit(true); setPanel({ type: 'gallery' }); }}
            refreshWidgets={refreshWidgets}
            removeResult={removeResult}
            closeTabResult={closeTabResult}
            activate={activate}
          />
        )}
        {toast && <div class="toast">{toast}</div>}
      </div>
    </div>
  );
}

/** Glass tuning → CSS variables (the refraction part is applied by the content script). */
export function tuneVars(t: Partial<GlassTune> | undefined): Record<string, string> {
  const v = { ...DEFAULT_GLASS_TUNE, ...t };
  return { '--ta': String(v.tint), '--rim-k': String(v.rim), '--light-r': `${v.light}px` };
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

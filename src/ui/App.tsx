import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bg } from '../shared/messages';
import { builtinCommands } from './commands';
import { MODE, closeBar, favicon, focusTab, openUrl, setCloser, webSearch } from './env';
import { useSnapshot, type Snapshot } from './hooks';
import { asyncResults, rank, syncResults, type Result } from './search';
import { Grid } from './Grid';
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
};

export function App(props: { initial: Snapshot }) {
  const snap = useSnapshot(props.initial);
  const [visible, setVisible] = useState(MODE !== 'frame');
  const [query, setQuery] = useState('');
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
      } else if (MODE === 'window') window.close();
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
          });
        } else if (e.data?.diarc === 'hide') {
          setVisible(false);
          reset();
        }
      };
      window.addEventListener('message', onMsg);
      parent.postMessage({ diarc: 'ready' }, '*');
      return () => window.removeEventListener('message', onMsg);
    }
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
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const sync = syncResults(query, tabs, commands);
    setResults(rank(query, sync));
    setSel(0);
    asyncResults(query).then((more) => {
      if (token === searchToken.current) setResults(rank(query, [...sync, ...more]));
    });
  }, [query, tabs, commands]);

  useEffect(() => {
    listRef.current?.querySelector('.res.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const activate = async (r: Result | undefined, mods: { shift?: boolean } = {}) => {
    if (!r) return;
    const newTab = snap.settings.openInNewTab !== !!mods.shift;
    try {
      switch (r.kind) {
        case 'tab':
          return await focusTab(r.tab!);
        case 'url':
        case 'bookmark':
        case 'history':
          return await openUrl(r.url!, newTab);
        case 'search':
          return await webSearch(query.trim(), newTab);
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

  const onInputKey = (e: KeyboardEvent) => {
    const n = results.length;
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
  const live = useRef({ panel, edit });
  live.current = { panel, edit };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = target !== input.current && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      const cur = live.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (inField) {
          target.blur();
          input.current?.focus();
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && MODE === 'frame') closeBar();
      }}
    >
      <div class="panel" role="dialog" aria-label="Diarc">
        <div class="bar">
          <span class="bar-icon"><IconSearch size={18} /></span>
          <input
            ref={input}
            value={query}
            placeholder="Поиск, URL или команда"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={onInputKey}
          />
          {!query && (
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

        {query ? (
          <div class="results" ref={listRef}>
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
          <div class="home">
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

        <div class="foot">
          {query ? (
            <>
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
  if (r.kind === 'search') return <IconSearch size={16} />;
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

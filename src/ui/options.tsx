import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { bg } from '../shared/messages';
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS, K, getSettings, saveLayout, saveSettings, type Settings } from '../shared/storage';
import './styles.css';
import './options.css';

type Status = Record<'google' | 'ticktick', { connected: boolean; scopes?: string[] }>;

function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState('');
  const redirect = chrome.identity.getRedirectURL();

  const loadStatus = () => bg<Status>({ type: 'auth:status' }).then(setStatus).catch(() => {});
  useEffect(() => {
    getSettings().then(setS);
    loadStatus();
    chrome.commands.getAll().then((c) => setShortcut(c.find((x) => x.name === 'toggle-command-bar')?.shortcut ?? ''));
  }, []);

  const update = (patch: Partial<Settings>) => {
    setS((cur) => ({ ...cur, ...patch }));
    saveSettings(patch).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  };
  const connect = async (provider: 'google' | 'ticktick') => {
    setMsg('');
    try {
      const scopes = provider === 'google' ? ['https://www.googleapis.com/auth/calendar.events'] : undefined;
      await bg({ type: 'auth:connect', provider, scopes });
    } catch (e) {
      setMsg((e as Error).message);
    }
    loadStatus();
  };
  const disconnect = async (provider: 'google' | 'ticktick') => {
    await bg({ type: 'auth:disconnect', provider });
    loadStatus();
  };

  return (
    <div class="opt">
      <header>
        <h1>Diarc</h1>
        <span class={`saved ${saved ? 'on' : ''}`}>Сохранено</span>
      </header>

      <section>
        <h2>Сочетание клавиш</h2>
        <p>
          Сейчас: <b>{shortcut || 'не назначено'}</b>.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); }}>Изменить</a>
        </p>
        <p class="muted">
          Расширения не могут занять ⌘T. Чтобы бар открывался по ⌘T, установите правило Karabiner-Elements из папки <code>karabiner/</code> репозитория:
          оно превращает ⌘T в ⌃⇧Space (только в Dia), а ⌘K — в ⌘T (обычная новая вкладка).
        </p>
      </section>

      <section>
        <h2>Поведение</h2>
        <label class="row">
          <span>Предзагружать бар в активной вкладке<small>Мгновенное первое открытие. Неактивные вкладки через 5 минут освобождают память.</small></span>
          <input type="checkbox" checked={s.prewarm} onChange={(e) => update({ prewarm: (e.target as HTMLInputElement).checked })} />
        </label>
        <label class="row">
          <span>Enter открывает в новой вкладке<small>Shift+Enter делает наоборот</small></span>
          <input type="checkbox" checked={s.openInNewTab} onChange={(e) => update({ openInNewTab: (e.target as HTMLInputElement).checked })} />
        </label>
        <label class="row">
          <span>Тема</span>
          <select value={s.theme} onChange={(e) => update({ theme: (e.target as HTMLSelectElement).value as Settings['theme'] })}>
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Google (Календарь, Gmail API)</h2>
        <p class="muted">
          Нужен OAuth-клиент типа «Web application» с Redirect URI ниже. Пошагово: <code>docs/OAUTH.md</code>. Gmail в простом режиме работает без этого.
        </p>
        <Copy label="Redirect URI" value={redirect} />
        <label class="field">
          <span>Client ID</span>
          <input type="text" value={s.googleClientId} placeholder="xxxx.apps.googleusercontent.com" onChange={(e) => update({ googleClientId: (e.target as HTMLInputElement).value.trim() })} />
        </label>
        <Account connected={!!status?.google.connected} detail={status?.google.scopes?.filter((x) => x.includes('googleapis')).map((x) => x.split('/').pop()).join(', ')} onConnect={() => connect('google')} onDisconnect={() => disconnect('google')} />
      </section>

      <section>
        <h2>TickTick</h2>
        <p class="muted">Создайте приложение на developer.ticktick.com (Manage Apps → New App) с тем же Redirect URI.</p>
        <label class="field">
          <span>Client ID</span>
          <input type="text" value={s.tickTickClientId} onChange={(e) => update({ tickTickClientId: (e.target as HTMLInputElement).value.trim() })} />
        </label>
        <label class="field">
          <span>Client Secret</span>
          <input type="password" value={s.tickTickClientSecret} onChange={(e) => update({ tickTickClientSecret: (e.target as HTMLInputElement).value.trim() })} />
        </label>
        <Account connected={!!status?.ticktick.connected} onConnect={() => connect('ticktick')} onDisconnect={() => disconnect('ticktick')} />
      </section>
      {msg && <p class="error">{msg}</p>}

      <section>
        <h2>Виджеты</h2>
        <p class="muted">Плитки настраиваются прямо в баре: долгое нажатие или кнопка ▦ рядом с полем поиска.</p>
        <button class="k-btn" onClick={async () => { await saveLayout(DEFAULT_LAYOUT); setMsg('Раскладка сброшена'); }}>Сбросить раскладку</button>{' '}
        <button class="k-btn" onClick={async () => {
          const all = await chrome.storage.local.get(null);
          await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('cache:')));
          setMsg('Кеш очищен');
        }}>Очистить кеш</button>
      </section>
      <footer class="muted">Settings key: <code>{K.settings}</code> · v{chrome.runtime.getManifest().version}</footer>
    </div>
  );
}

function Copy(props: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div class="field">
      <span>{props.label}</span>
      <div class="copy">
        <code>{props.value}</code>
        <button class="k-btn" onClick={() => navigator.clipboard.writeText(props.value).then(() => { setOk(true); setTimeout(() => setOk(false), 1000); })}>{ok ? 'Скопировано' : 'Копировать'}</button>
      </div>
    </div>
  );
}

function Account(props: { connected: boolean; detail?: string; onConnect(): void; onDisconnect(): void }) {
  return (
    <div class="account">
      <span class={`dot ${props.connected ? 'on' : ''}`} />
      <span>{props.connected ? `Подключено${props.detail ? ` · ${props.detail}` : ''}` : 'Не подключено'}</span>
      {props.connected ? (
        <button class="k-btn" onClick={props.onDisconnect}>Отключить</button>
      ) : (
        <button class="k-btn k-primary" onClick={props.onConnect}>Подключить</button>
      )}
    </div>
  );
}

render(<Options />, document.getElementById('app')!);

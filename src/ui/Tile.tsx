import { Component, type ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { widgets } from '../widgets/registry';
import { bg } from '../shared/messages';
import { getLayout, saveLayout, type CacheEntry, type Tile } from '../shared/storage';
import { SIZE_SPANS, defaultConfig, resolveAuth, type TileSize } from '../shared/widget';
import { openUrl } from './env';
import { Button, IconRefresh, IconSettings } from './kit';

class Boundary extends Component<{ children: ComponentChildren }, { error?: Error }> {
  state: { error?: Error } = {};
  componentDidCatch(error: Error) {
    this.setState({ error });
  }
  render() {
    if (this.state.error) return <div class="tile-msg">Ошибка виджета: {this.state.error.message}</div>;
    return this.props.children;
  }
}

const PROVIDER_NAME = { google: 'Google', ticktick: 'TickTick' };

export function TileView(props: {
  tile: Tile;
  entry?: CacheEntry;
  edit: boolean;
  dragging: boolean;
  onRemove(): void;
  onResize(size: TileSize): void;
  onSettings(): void;
  onPointerDown(e: PointerEvent): void;
  onToast(msg: string): void;
}) {
  const { tile, entry, edit } = props;
  const def = widgets.get(tile.widget);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [cols, rows] = SIZE_SPANS[tile.size] ?? [2, 2];
  const style = { gridColumn: `span ${cols}`, gridRow: `span ${rows}` };

  if (!def) {
    return (
      <div class="tile glass" style={style} data-tile={tile.id}>
        {edit && <button class="tile-remove" onClick={props.onRemove}>−</button>}
        <div class="tile-msg">Виджет «{tile.widget}» не найден</div>
      </div>
    );
  }
  const config = { ...defaultConfig(def), ...tile.config };
  const auth = resolveAuth(def, config);

  const connect = async () => {
    if (!auth) return;
    setConnecting(true);
    setConnectError('');
    try {
      await bg({ type: 'auth:connect', provider: auth.provider, scopes: auth.scopes });
    } catch (e) {
      setConnectError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };
  const refresh = () => bg({ type: 'widget:refresh', ids: [tile.id], force: true }).catch(() => {});
  const run = async (action: string, payload?: unknown) => {
    try {
      return await bg({ type: 'widget:action', id: tile.id, action, payload });
    } catch (e) {
      props.onToast((e as Error).message);
      throw e;
    }
  };

  let body: ComponentChildren;
  const hasData = entry?.data !== undefined;
  const needsConfig = (connectError || entry?.error || '').includes('настройках');
  if (entry?.needsAuth && !hasData) {
    body = (
      <div class="tile-connect">
        <div class="tile-connect-icon">{def.icon}</div>
        <div class="tile-connect-name">{def.name}</div>
        <div class="tile-connect-text">{connectError || (needsConfig ? entry.error : `Подключите ${PROVIDER_NAME[entry.needsAuth as 'google'] ?? entry.needsAuth}`)}</div>
        {needsConfig ? (
          <Button primary onClick={() => chrome.runtime.openOptionsPage()}>Открыть настройки</Button>
        ) : (
          <Button primary disabled={connecting} onClick={connect}>{connecting ? 'Подключаю…' : 'Подключить'}</Button>
        )}
      </div>
    );
  } else if (!hasData && entry?.error) {
    body = (
      <div class="tile-msg">
        <div>{def.icon} {def.name}</div>
        <div class="tile-err">{entry.error}</div>
        <Button onClick={refresh}>Повторить</Button>
      </div>
    );
  } else if (!hasData && def.fetch) {
    body = <div class="tile-skeleton"><i /><i /><i /></div>;
  } else {
    body = (
      <Boundary>
        <def.View
          data={entry?.data}
          config={config}
          size={tile.size}
          loading={!!entry?.fetching}
          updatedAt={entry?.updatedAt}
          run={run}
          refresh={refresh}
          setConfig={async (patch) => {
            const layout = await getLayout();
            await saveLayout(layout.map((t) => (t.id === tile.id ? { ...t, config: { ...t.config, ...patch } } : t)));
          }}
          open={(url, o) => openUrl(url, o?.newTab ?? true)}
        />
      </Boundary>
    );
  }

  return (
    <div
      class={`tile glass tile-${def.id} size-${tile.size} ${edit ? 'jiggle' : ''} ${props.dragging ? 'dragging' : ''}`}
      style={style}
      data-tile={tile.id}
      onPointerDown={props.onPointerDown}
    >
      <div class="tile-body" inert={edit}>{body}</div>
      {hasData && entry?.needsAuth && !edit && (
        <button class="tile-banner" onClick={connect}>Сессия истекла — переподключить</button>
      )}
      {hasData && entry?.error && !entry.needsAuth && !edit && (
        <button class="tile-banner muted" onClick={refresh} title={entry.error}><IconRefresh size={11} /> Не обновилось</button>
      )}
      {edit && (
        <>
          <button class="tile-remove" title="Удалить виджет" onClick={props.onRemove}>−</button>
          <div class="tile-controls">
            {def.sizes.length > 1 &&
              def.sizes.map((s) => (
                <button key={s} class={s === tile.size ? 'on' : ''} title={`Размер ${s}`} onClick={() => props.onResize(s)}>{s}</button>
              ))}
            {def.settings?.length ? (
              <button title="Настройки виджета" onClick={props.onSettings}><IconSettings size={12} /></button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

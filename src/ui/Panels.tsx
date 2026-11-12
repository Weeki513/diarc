import { useState } from 'preact/hooks';
import { widgets } from '../widgets/registry';
import { bg } from '../shared/messages';
import { saveLayout, type Tile } from '../shared/storage';
import { SIZE_LABELS, defaultConfig } from '../shared/widget';
import { Button, IconX } from './kit';

export function Sheet(props: { title: string; onClose(): void; children: preact.ComponentChildren }) {
  return (
    <div class="sheet">
      <div class="sheet-head">
        <span>{props.title}</span>
        <button class="k-icon-btn" onClick={props.onClose} title="Закрыть"><IconX /></button>
      </div>
      <div class="sheet-body">{props.children}</div>
    </div>
  );
}

export function Gallery(props: { layout: Tile[]; onClose(): void }) {
  const add = async (id: string) => {
    const def = widgets.get(id)!;
    const tile: Tile = { id: `${id}-${Math.random().toString(36).slice(2, 8)}`, widget: id, size: def.defaultSize, config: {} };
    await saveLayout([...props.layout, tile]);
    props.onClose();
  };
  return (
    <Sheet title="Добавить виджет" onClose={props.onClose}>
      <div class="gallery">
        {[...widgets.values()].map((def) => (
          <button key={def.id} class="gallery-item" onClick={() => add(def.id)}>
            <span class="gallery-icon">{def.icon}</span>
            <span class="gallery-text">
              <b>{def.name}</b>
              <small>{def.description}</small>
              <small class="gallery-sizes">{def.sizes.map((s) => SIZE_LABELS[s]).join(' · ')}</small>
            </span>
          </button>
        ))}
      </div>
      <p class="hint">Свой виджет: один файл в <code>src/widgets/&lt;id&gt;/index.tsx</code>. Инструкция в <code>docs/WIDGETS.md</code>.</p>
    </Sheet>
  );
}

export function TileSettings(props: { layout: Tile[]; id: string; onClose(): void }) {
  const tile = props.layout.find((t) => t.id === props.id);
  const def = tile && widgets.get(tile.widget);
  const [values, setValues] = useState<Record<string, any>>(() => (def ? { ...defaultConfig(def), ...tile!.config } : {}));
  if (!tile || !def) return null;
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const save = async () => {
    await saveLayout(props.layout.map((t) => (t.id === tile.id ? { ...t, config: values } : t)));
    bg({ type: 'widget:refresh', ids: [tile.id], force: true }).catch(() => {});
    props.onClose();
  };
  return (
    <Sheet title={`${def.icon} ${def.name}`} onClose={props.onClose}>
      <form class="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {def.settings?.map((s) => (
          <label key={s.key} class={`field field-${s.type}`}>
            <span>{s.label}</span>
            {s.type === 'textarea' ? (
              <textarea rows={6} value={values[s.key] ?? ''} placeholder={s.placeholder} onInput={(e) => set(s.key, (e.target as HTMLTextAreaElement).value)} />
            ) : s.type === 'select' ? (
              <select value={values[s.key]} onChange={(e) => set(s.key, (e.target as HTMLSelectElement).value)}>
                {s.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : s.type === 'toggle' ? (
              <input type="checkbox" checked={!!values[s.key]} onChange={(e) => set(s.key, (e.target as HTMLInputElement).checked)} />
            ) : (
              <input
                type={s.type === 'number' ? 'number' : 'text'}
                value={values[s.key] ?? ''}
                placeholder={s.placeholder}
                onInput={(e) => set(s.key, s.type === 'number' ? Number((e.target as HTMLInputElement).value) : (e.target as HTMLInputElement).value)}
              />
            )}
            {s.help && <small>{s.help}</small>}
          </label>
        ))}
        <div class="form-actions">
          <Button onClick={props.onClose}>Отмена</Button>
          <Button primary onClick={save}>Сохранить</Button>
        </div>
      </form>
    </Sheet>
  );
}

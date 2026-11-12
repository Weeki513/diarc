/**
 * UI kit for widget Views. Use these instead of custom markup where possible so widgets
 * look consistent and follow light/dark themes automatically. Styles: src/ui/styles.css (.k-*).
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export * from './icons';
import { IconPlus } from './icons';

export function Header(props: { title: string; icon?: string; right?: ComponentChildren; onClick?: () => void }) {
  return (
    <div class="k-header">
      <button class="k-header-title" onClick={props.onClick} disabled={!props.onClick}>
        {props.icon && <span class="k-header-icon">{props.icon}</span>}
        {props.title}
      </button>
      {props.right && <div class="k-header-right">{props.right}</div>}
    </div>
  );
}

export function Scroll(props: { children: ComponentChildren }) {
  return <div class="k-scroll">{props.children}</div>;
}

export function Group(props: { label: string; children: ComponentChildren }) {
  return (
    <div class="k-group">
      <div class="k-group-label">{props.label}</div>
      {props.children}
    </div>
  );
}

export function Row(props: {
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  meta?: ComponentChildren;
  leading?: ComponentChildren;
  /** Buttons shown on hover. */
  actions?: ComponentChildren;
  onClick?: () => void;
  muted?: boolean;
  active?: boolean;
  class?: string;
}) {
  return (
    <div class={`k-row ${props.onClick ? 'k-clickable' : ''} ${props.muted ? 'k-muted' : ''} ${props.active ? 'k-active' : ''} ${props.class ?? ''}`} onClick={props.onClick}>
      {props.leading && <div class="k-row-leading">{props.leading}</div>}
      <div class="k-row-main">
        <div class="k-row-title">{props.title}</div>
        {props.subtitle && <div class="k-row-sub">{props.subtitle}</div>}
      </div>
      {props.meta && <div class="k-row-meta">{props.meta}</div>}
      {props.actions && (
        <div class="k-row-actions" onClick={(e) => e.stopPropagation()}>
          {props.actions}
        </div>
      )}
    </div>
  );
}

export function IconButton(props: { title: string; onClick: (e: MouseEvent) => void; children: ComponentChildren; danger?: boolean }) {
  return (
    <button class={`k-icon-btn ${props.danger ? 'k-danger' : ''}`} title={props.title} aria-label={props.title} onClick={(e) => { e.stopPropagation(); props.onClick(e); }}>
      {props.children}
    </button>
  );
}

export function Button(props: { onClick: () => void; children: ComponentChildren; primary?: boolean; disabled?: boolean }) {
  return (
    <button class={`k-btn ${props.primary ? 'k-primary' : ''}`} disabled={props.disabled} onClick={(e) => { e.stopPropagation(); props.onClick(); }}>
      {props.children}
    </button>
  );
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; color?: string; title?: string }) {
  return (
    <button
      class={`k-check ${props.checked ? 'k-checked' : ''}`}
      style={props.color ? { '--c': props.color } : undefined}
      title={props.title ?? 'Выполнено'}
      onClick={(e) => { e.stopPropagation(); props.onChange(!props.checked); }}
    >
      {props.checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M20 6 9 17l-5-5" /></svg>}
    </button>
  );
}

/** Input that calls onSubmit(text) on Enter, shows a spinner while it runs, and clears on success. */
export function AddInput(props: {
  placeholder: string;
  onSubmit: (text: string) => Promise<unknown>;
  autoFocus?: boolean;
  /** Called on Escape, or on blur while empty. */
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.autoFocus) ref.current?.focus();
  }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr('');
    try {
      await props.onSubmit(text);
      setValue('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="k-add">
      <span class="k-add-plus">{busy ? <span class="k-spin" /> : '+'}</span>
      <input
        ref={ref}
        value={value}
        placeholder={props.placeholder}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape' && props.onCancel) { e.stopPropagation(); props.onCancel(); }
        }}
        onBlur={() => { if (!value.trim() && props.onCancel) props.onCancel(); }}
        onClick={(e) => e.stopPropagation()}
      />
      {err && <span class="k-add-err" title={err}>!</span>}
    </div>
  );
}

/** Text that turns into an input on edit; Enter saves, Escape cancels. */
export function EditableText(props: { value: string; editing: boolean; onSave: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.editing) ref.current?.select();
  }, [props.editing]);
  if (!props.editing) return <>{props.value}</>;
  return (
    <input
      ref={ref}
      class="k-inline-input"
      defaultValue={props.value}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') props.onSave(e.currentTarget.value.trim());
        if (e.key === 'Escape') { e.stopPropagation(); props.onCancel(); }
      }}
      onBlur={(e) => props.onSave((e.target as HTMLInputElement).value.trim())}
    />
  );
}

export function Empty(props: { children: ComponentChildren; icon?: string }) {
  return (
    <div class="k-empty">
      {props.icon && <div class="k-empty-icon">{props.icon}</div>}
      <div>{props.children}</div>
    </div>
  );
}

export function Big(props: { children: ComponentChildren; sub?: ComponentChildren }) {
  return (
    <div class="k-big">
      <div class="k-big-main">{props.children}</div>
      {props.sub && <div class="k-big-sub">{props.sub}</div>}
    </div>
  );
}

export function Dot(props: { color?: string }) {
  return <span class="k-dot" style={{ background: props.color ?? 'var(--accent)' }} />;
}

/** Track optimistic hides (e.g. a completed task disappears immediately). */
export function useOptimistic() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  return {
    hidden,
    hide: (id: string) => setHidden((s) => new Set(s).add(id)),
    restore: (id: string) => setHidden((s) => { const n = new Set(s); n.delete(id); return n; }),
  };
}

/**
 * "+" for tiles too small for a permanent add field: put `add.button` in Header's `right`
 * and render `add.field` above the list. Large tiles can show <AddInput> permanently instead.
 */
export function useAddField(placeholder: string, onSubmit: (text: string) => Promise<unknown>) {
  const [open, setOpen] = useState(false);
  return {
    open,
    button: (
      <IconButton title="Добавить" onClick={() => setOpen((v) => !v)}>
        <IconPlus />
      </IconButton>
    ),
    field: open ? (
      <AddInput
        autoFocus
        placeholder={placeholder}
        onCancel={() => setOpen(false)}
        onSubmit={async (t) => {
          await onSubmit(t);
          setOpen(false);
        }}
      />
    ) : null,
  };
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { saveLayout, type CacheEntry, type Tile } from '../shared/storage';
import type { TileSize } from '../shared/widget';
import { TileView } from './Tile';
import { IconPlus } from './kit';

/** iOS-style tile grid: long-press (or "Изменить") enters edit mode; drag to reorder; S/M/L/XL sizes. */
export function Grid(props: {
  layout: Tile[];
  cache: Record<string, CacheEntry>;
  edit: boolean;
  setEdit(v: boolean): void;
  openGallery(): void;
  openSettings(id: string): void;
  onToast(msg: string): void;
}) {
  const [order, setOrder] = useState<Tile[]>(props.layout);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; dx: number; dy: number } | null>(null);
  const press = useRef<{ id: string; x: number; y: number; timer?: number; moved: boolean; el: HTMLElement } | null>(null);

  useEffect(() => {
    if (!dragId) setOrder(props.layout);
  }, [props.layout, dragId]);

  const update = (next: Tile[]) => {
    setOrder(next);
    saveLayout(next);
  };

  const onPointerDown = (tile: Tile) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (props.edit && target.closest('button')) return;
    const el = e.currentTarget as HTMLElement;
    press.current = { id: tile.id, x: e.clientX, y: e.clientY, moved: false, el };
    if (!props.edit) {
      // Long press anywhere on a tile enters edit mode (like iOS).
      press.current.timer = window.setTimeout(() => {
        props.setEdit(true);
        press.current = null;
      }, 500);
      return;
    }
    el.setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!props.edit) {
        if (dist > 6) {
          clearTimeout(p.timer);
          press.current = null;
        }
        return;
      }
      if (!p.moved && dist < 5) return;
      if (!p.moved) {
        p.moved = true;
        const r = p.el.getBoundingClientRect();
        setDragId(p.id);
        setGhost({ x: e.clientX, y: e.clientY, w: r.width, h: r.height, dx: p.x - r.left, dy: p.y - r.top });
      }
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      const over = (document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.tile && (n as HTMLElement).dataset.tile !== p.id) as HTMLElement | undefined)?.dataset.tile;
      if (over) {
        setOrder((cur) => {
          const from = cur.findIndex((t) => t.id === p.id);
          const to = cur.findIndex((t) => t.id === over);
          if (from < 0 || to < 0 || from === to) return cur;
          const next = cur.slice();
          const [item] = next.splice(from, 1);
          next.splice(to, 0, item);
          return next;
        });
      }
    };
    const up = () => {
      const p = press.current;
      if (p) clearTimeout(p.timer);
      if (p?.moved) {
        setOrder((cur) => {
          saveLayout(cur);
          return cur;
        });
      }
      press.current = null;
      setDragId(null);
      setGhost(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [props.edit]);

  const dragged = order.find((t) => t.id === dragId);

  return (
    <div class="grid-wrap">
      <div class={`grid ${props.edit ? 'editing' : ''}`}>
        {order.map((tile) => (
          <TileView
            key={tile.id}
            tile={tile}
            entry={props.cache[tile.id]}
            edit={props.edit}
            dragging={tile.id === dragId}
            onPointerDown={onPointerDown(tile)}
            onRemove={() => update(order.filter((t) => t.id !== tile.id))}
            onResize={(size: TileSize) => update(order.map((t) => (t.id === tile.id ? { ...t, size } : t)))}
            onSettings={() => props.openSettings(tile.id)}
            onToast={props.onToast}
          />
        ))}
        {props.edit && (
          <button class="tile tile-add" style={{ gridColumn: 'span 1', gridRow: 'span 1' }} onClick={props.openGallery}>
            <IconPlus size={22} />
            <span>Виджет</span>
          </button>
        )}
        {!order.length && !props.edit && (
          <button class="grid-empty" onClick={() => { props.setEdit(true); props.openGallery(); }}>
            Добавьте виджеты: Календарь, Gmail, TickTick…
          </button>
        )}
      </div>
      {ghost && dragged && (
        <div class="ghost" style={{ left: ghost.x - ghost.dx, top: ghost.y - ghost.dy, width: ghost.w, height: ghost.h }} />
      )}
    </div>
  );
}

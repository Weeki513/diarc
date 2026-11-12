import { useState } from 'preact/hooks';
import { defineWidget, type WidgetContext } from '../../shared/widget';
import { addDays, fmtDayLabel, fmtShort, fmtTime, parseWhen, startOfDay } from '../../shared/dates';
import { AddInput, Big, Check, EditableText, Empty, Group, Header, IconButton, IconPencil, IconTrash, Row, Scroll, useOptimistic } from '../../ui/kit';

interface Task {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  due?: string;
  allDay?: boolean;
  priority: number;
}
interface Data {
  tasks: Task[];
}
interface Config {
  scope: 'today' | 'week' | 'all';
}

const AUTH = { provider: 'ticktick' as const };
const API = 'https://api.ticktick.com/open/v1';
const PRIORITY_COLOR: Record<number, string> = { 5: '#e5484d', 3: '#f5a524', 1: '#3e9bff', 0: '' };

/** TickTick wants "yyyy-MM-dd'T'HH:mm:ssZ" e.g. 2026-11-13T15:00:00+0000 */
const ttDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+0000');

async function createTask(ctx: WidgetContext<Config>, text: string, projectId?: string): Promise<string> {
  const p = parseWhen(text);
  const body: Record<string, unknown> = { title: p.title || text, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (projectId) body.projectId = projectId;
  if (p.start) {
    body.dueDate = ttDate(p.start);
    body.startDate = ttDate(p.start);
    body.isAllDay = !p.hasTime;
  }
  await ctx.http(`${API}/task`, { method: 'POST', auth: AUTH, json: body });
  return `Задача «${body.title}»${p.start ? ` — ${fmtDayLabel(p.start).toLowerCase()}${p.hasTime ? ` в ${fmtTime(p.start)}` : ''}` : ''}`;
}

export default defineWidget<Data, Config>({
  id: 'ticktick',
  name: 'TickTick',
  description: 'Задачи на сегодня и просроченные. Отметка, добавление, переименование.',
  icon: '✅',
  sizes: ['S', 'M', 'L', 'XL'],
  defaultSize: 'L',
  auth: AUTH,
  refreshMinutes: 5,
  settings: [
    {
      key: 'scope',
      label: 'Показывать',
      type: 'select',
      default: 'today',
      options: [
        { value: 'today', label: 'Сегодня и просроченные' },
        { value: 'week', label: 'Ближайшие 7 дней' },
        { value: 'all', label: 'Все незавершённые' },
      ],
    },
  ],

  async fetch(ctx) {
    const projects = await ctx.http<{ id: string; name: string; closed?: boolean }[]>(`${API}/project`, { auth: AUTH });
    const list = [{ id: 'inbox', name: 'Входящие' }, ...projects.filter((p) => !p.closed)].slice(0, 25);
    const results = await Promise.allSettled(
      list.map((p) => ctx.http<{ tasks?: any[] }>(`${API}/project/${p.id}/data`, { auth: AUTH }).then((d) => ({ p, tasks: d?.tasks ?? [] }))),
    );
    const horizon =
      ctx.config.scope === 'all' ? Infinity : addDays(startOfDay(new Date()), ctx.config.scope === 'week' ? 7 : 1).getTime();
    const tasks: Task[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const t of r.value.tasks) {
        if (t.status !== 0) continue;
        const due = t.dueDate ? new Date(t.dueDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : undefined;
        if (ctx.config.scope !== 'all' && (!due || due.getTime() >= horizon)) continue;
        tasks.push({ id: t.id, projectId: t.projectId, projectName: r.value.p.name, title: t.title, due: due?.toISOString(), allDay: t.isAllDay, priority: t.priority ?? 0 });
      }
    }
    tasks.sort((a, b) => (a.due ? new Date(a.due).getTime() : Infinity) - (b.due ? new Date(b.due).getTime() : Infinity) || b.priority - a.priority);
    return { tasks: tasks.slice(0, 80) };
  },

  actions: {
    create: (ctx, p: { text: string }) => createTask(ctx, p.text),
    complete: (ctx, p: { id: string; projectId: string }) =>
      ctx.http(`${API}/project/${p.projectId}/task/${p.id}/complete`, { method: 'POST', auth: AUTH, as: 'none' }),
    rename: (ctx, p: { id: string; projectId: string; title: string }) =>
      ctx.http(`${API}/task/${p.id}`, { method: 'POST', auth: AUTH, json: { id: p.id, projectId: p.projectId, title: p.title } }),
    reschedule: (ctx, p: { id: string; projectId: string; when: string }) => {
      const w = parseWhen(p.when);
      if (!w.start) throw new Error('Не понял дату');
      return ctx.http(`${API}/task/${p.id}`, {
        method: 'POST',
        auth: AUTH,
        json: { id: p.id, projectId: p.projectId, dueDate: ttDate(w.start), startDate: ttDate(w.start), isAllDay: !w.hasTime },
      });
    },
    remove: (ctx, p: { id: string; projectId: string }) =>
      ctx.http(`${API}/project/${p.projectId}/task/${p.id}`, { method: 'DELETE', auth: AUTH, as: 'none' }),
  },

  commands: [
    { id: 'create', title: 'Новая задача', prefix: ['t', 'task', 'з', 'задача', 'todo'], hint: 'TickTick · «купить молоко завтра»', run: (ctx, text) => createTask(ctx, text) },
  ],

  View({ data, size, run, open }) {
    const { hidden, hide, restore } = useOptimistic();
    const [editing, setEditing] = useState<string | null>(null);
    const now = new Date();
    const tasks = (data?.tasks ?? []).filter((t) => !hidden.has(t.id));
    const today = startOfDay(now);
    const complete = (t: Task) => {
      hide(t.id);
      run('complete', { id: t.id, projectId: t.projectId }).catch(() => restore(t.id));
    };
    const openApp = () => open('https://ticktick.com/webapp/#q/all/today');

    if (size === 'S') {
      return (
        <div class="k-pad k-clickable" onClick={openApp}>
          <Header title="TickTick" icon="✅" />
          <Big sub={tasks[0]?.title ?? 'Всё сделано'}>{tasks.length}</Big>
        </div>
      );
    }

    const label = (t: Task) => {
      if (!t.due) return 'Без даты';
      const d = new Date(t.due);
      if (d < today) return 'Просрочено';
      return fmtDayLabel(d, now);
    };
    const groups = new Map<string, Task[]>();
    for (const t of tasks.slice(0, size === 'M' ? 3 : undefined)) groups.set(label(t), [...(groups.get(label(t)) ?? []), t]);

    const row = (t: Task) => (
      <Row
        key={t.id}
        leading={<Check checked={false} color={PRIORITY_COLOR[t.priority]} onChange={() => complete(t)} />}
        title={<EditableText value={t.title} editing={editing === t.id} onCancel={() => setEditing(null)} onSave={(title) => { setEditing(null); if (title && title !== t.title) run('rename', { id: t.id, projectId: t.projectId, title }); }} />}
        subtitle={size === 'M' ? undefined : t.projectName}
        meta={t.due ? (t.allDay ? (new Date(t.due) < today ? fmtShort(new Date(t.due), now) : '') : fmtTime(new Date(t.due))) : ''}
        actions={
          size === 'M' ? undefined : (
            <>
              <IconButton title="Переименовать" onClick={() => setEditing(t.id)}><IconPencil /></IconButton>
              <IconButton title="Удалить" danger onClick={() => { hide(t.id); run('remove', { id: t.id, projectId: t.projectId }).catch(() => restore(t.id)); }}><IconTrash /></IconButton>
            </>
          )
        }
        onClick={() => open(`https://ticktick.com/webapp/#p/${t.projectId}/tasks/${t.id}`)}
      />
    );

    return (
      <div class="k-pad k-col">
        <Header title="TickTick" icon="✅" onClick={openApp} right={<span class="k-count">{tasks.length || ''}</span>} />
        <Scroll>
          {tasks.length === 0 && <Empty icon="🎉">Всё сделано</Empty>}
          {size === 'M'
            ? tasks.slice(0, 3).map(row)
            : [...groups].map(([g, list]) => (
                <Group key={g} label={g}>
                  {list.map(row)}
                </Group>
              ))}
        </Scroll>
        {size !== 'M' && <AddInput placeholder="Новая задача: «отчёт завтра в 10»" onSubmit={(text) => run('create', { text })} />}
      </div>
    );
  },
});

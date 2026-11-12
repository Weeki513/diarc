import { useState } from 'preact/hooks';
import { defineWidget, type WidgetContext } from '../../shared/widget';
import { addDays, fmtDayLabel, fmtRelative, fmtTime, parseWhen, startOfDay, toLocalInput } from '../../shared/dates';
import { AddInput, Big, Button, Dot, Empty, Group, Header, IconButton, IconPencil, IconTrash, Row, Scroll, useOptimistic } from '../../ui/kit';
import { useTick } from '../../ui/hooks';

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link?: string;
  meet?: string;
  location?: string;
  color?: string;
}
interface Data {
  events: CalEvent[];
}
interface Config {
  calendarId: string;
  days: number;
}

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const AUTH = { provider: 'google' as const, scopes: SCOPES };
const API = 'https://www.googleapis.com/calendar/v3';
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Google event colorId → hex (https://developers.google.com/calendar/api/v3/reference/colors)
const COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

const base = (c: Config) => `${API}/calendars/${encodeURIComponent(c.calendarId || 'primary')}/events`;

async function create(ctx: WidgetContext<Config>, text: string): Promise<string> {
  const p = parseWhen(text);
  if (!p.start) {
    // No date found: let Google's quickAdd try (it understands English phrases).
    await ctx.http(`${base(ctx.config)}/quickAdd?text=${encodeURIComponent(text)}`, { method: 'POST', auth: AUTH });
    return 'Событие создано';
  }
  const body = p.hasTime
    ? { summary: p.title || text, start: { dateTime: p.start.toISOString(), timeZone: tz() }, end: { dateTime: p.end!.toISOString(), timeZone: tz() } }
    : { summary: p.title || text, start: { date: ymd(p.start) }, end: { date: ymd(p.end!) } };
  await ctx.http(base(ctx.config), { method: 'POST', auth: AUTH, json: body });
  return `Событие «${body.summary}» — ${fmtDayLabel(p.start).toLowerCase()}${p.hasTime ? ` в ${fmtTime(p.start)}` : ''}`;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default defineWidget<Data, Config>({
  id: 'calendar',
  name: 'Google Календарь',
  description: 'События на сегодня и завтра. Создание, редактирование, удаление.',
  icon: '📅',
  sizes: ['S', 'M', 'L', 'XL'],
  defaultSize: 'L',
  auth: AUTH,
  refreshMinutes: 5,
  settings: [
    { key: 'calendarId', label: 'ID календаря', type: 'text', default: 'primary', help: '«primary» — основной календарь' },
    { key: 'days', label: 'Дней вперёд', type: 'number', default: 2 },
  ],

  async fetch(ctx) {
    const from = startOfDay(new Date());
    const to = addDays(from, Math.max(1, Number(ctx.config.days) || 2));
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
    const res = await ctx.http<{ items: any[] }>(`${base(ctx.config)}?${q}`, { auth: AUTH });
    return {
      events: (res.items ?? [])
        .filter((e) => e.status !== 'cancelled')
        .map((e) => ({
          id: e.id,
          title: e.summary ?? '(без названия)',
          start: e.start.dateTime ?? e.start.date,
          end: e.end.dateTime ?? e.end.date,
          allDay: !e.start.dateTime,
          link: e.htmlLink,
          meet: e.hangoutLink,
          location: e.location,
          color: e.colorId ? COLORS[e.colorId] : undefined,
        })),
    };
  },

  actions: {
    create: (ctx, p: { text: string }) => create(ctx, p.text),
    async update(ctx, p: { id: string; title?: string; start?: string; end?: string }) {
      const body: Record<string, unknown> = {};
      if (p.title !== undefined) body.summary = p.title;
      if (p.start) body.start = { dateTime: new Date(p.start).toISOString(), timeZone: tz() };
      if (p.end) body.end = { dateTime: new Date(p.end).toISOString(), timeZone: tz() };
      return ctx.http(`${base(ctx.config)}/${encodeURIComponent(p.id)}`, { method: 'PATCH', auth: AUTH, json: body });
    },
    async remove(ctx, p: { id: string }) {
      return ctx.http(`${base(ctx.config)}/${encodeURIComponent(p.id)}`, { method: 'DELETE', auth: AUTH, as: 'none' });
    },
  },

  commands: [
    { id: 'create', title: 'Новое событие', prefix: ['e', 'event', 'с', 'событие', 'cal'], hint: 'Google Календарь · «созвон завтра в 15:00 на 30 мин»', run: (ctx, text) => create(ctx, text) },
  ],

  View({ data, size, run, open }) {
    useTick(30_000);
    const now = new Date();
    const { hidden, hide, restore } = useOptimistic();
    const [editing, setEditing] = useState<string | null>(null);
    const events = (data?.events ?? []).filter((e) => !hidden.has(e.id) && new Date(e.end) > now);
    const openEvent = (e: CalEvent) => e.link && open(e.link);

    if (size === 'S' || size === 'M') {
      const next = events.filter((e) => !e.allDay).slice(0, size === 'S' ? 1 : 2);
      return (
        <div class="k-pad">
          <Header title="Календарь" icon="📅" onClick={() => open('https://calendar.google.com/')} />
          {next.length === 0 && <Empty>Больше событий нет</Empty>}
          {size === 'S' && next[0] && (
            <div class="k-clickable" onClick={() => openEvent(next[0])}>
              <Big sub={fmtRelative(new Date(next[0].start), now)}>{next[0].title}</Big>
            </div>
          )}
          {size === 'M' && next.map((e) => (
            <Row key={e.id} leading={<Dot color={e.color} />} title={e.title} meta={fmtTime(new Date(e.start))} onClick={() => openEvent(e)} active={new Date(e.start) <= now} />
          ))}
        </div>
      );
    }

    const groups = new Map<string, CalEvent[]>();
    for (const e of events) {
      const label = fmtDayLabel(new Date(e.allDay ? e.start + 'T00:00' : e.start), now);
      groups.set(label, [...(groups.get(label) ?? []), e]);
    }

    return (
      <div class="k-pad k-col">
        <Header title="Календарь" icon="📅" onClick={() => open('https://calendar.google.com/')} />
        <Scroll>
          {events.length === 0 && <Empty icon="☕">Свободно</Empty>}
          {[...groups].map(([label, list]) => (
            <Group key={label} label={label}>
              {list.map((e) =>
                editing === e.id ? (
                  <EventEditor key={e.id} event={e} onCancel={() => setEditing(null)} onSave={async (patch) => { setEditing(null); await run('update', { id: e.id, ...patch }); }} />
                ) : (
                  <Row
                    key={e.id}
                    leading={<Dot color={e.color} />}
                    title={e.title}
                    subtitle={e.meet ? 'Google Meet' : e.location}
                    meta={e.allDay ? 'весь день' : `${fmtTime(new Date(e.start))}–${fmtTime(new Date(e.end))}`}
                    active={!e.allDay && new Date(e.start) <= now}
                    onClick={() => (e.meet && new Date(e.start).getTime() - now.getTime() < 10 * 60_000 ? open(e.meet) : openEvent(e))}
                    actions={
                      <>
                        {!e.allDay && <IconButton title="Изменить" onClick={() => setEditing(e.id)}><IconPencil /></IconButton>}
                        <IconButton title="Удалить" danger onClick={() => { hide(e.id); run('remove', { id: e.id }).catch(() => restore(e.id)); }}><IconTrash /></IconButton>
                      </>
                    }
                  />
                ),
              )}
            </Group>
          ))}
        </Scroll>
        <AddInput placeholder="Новое событие: «созвон завтра в 15:00»" onSubmit={(text) => run('create', { text })} />
      </div>
    );
  },
});

function EventEditor(props: { event: CalEvent; onSave: (p: { title: string; start: string; end: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(props.event.title);
  const [start, setStart] = useState(toLocalInput(new Date(props.event.start)));
  const [end, setEnd] = useState(toLocalInput(new Date(props.event.end)));
  const save = () => props.onSave({ title, start, end });
  return (
    <div class="k-editor" onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); props.onCancel(); } }}>
      <input class="k-inline-input" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} autoFocus />
      <div class="k-editor-row">
        <input type="datetime-local" class="k-inline-input" value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} />
        <span>—</span>
        <input type="datetime-local" class="k-inline-input" value={end} onInput={(e) => setEnd((e.target as HTMLInputElement).value)} />
      </div>
      <div class="k-editor-row k-end">
        <Button onClick={props.onCancel}>Отмена</Button>
        <Button primary onClick={save}>Сохранить</Button>
      </div>
    </div>
  );
}

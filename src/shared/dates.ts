/** Date helpers + a tiny RU/EN natural-language parser ("созвон завтра в 15:30", "pay rent friday at 9am"). */

const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}\\d])';
const re = (s: string) => new RegExp(L + s + R, 'iu');

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAYS: [RegExp, number][] = [
  [re('(?:в\\s+|во\\s+)?(?:воскресенье|вс|sunday|sun)'), 0],
  [re('(?:в\\s+|во\\s+)?(?:понедельник|пн|monday|mon)'), 1],
  [re('(?:в\\s+|во\\s+)?(?:вторник|вт|tuesday|tue|tues)'), 2],
  [re('(?:в\\s+|во\\s+)?(?:среду|среда|ср|wednesday|wed)'), 3],
  [re('(?:в\\s+|во\\s+)?(?:четверг|чт|thursday|thu|thurs)'), 4],
  [re('(?:в\\s+|во\\s+)?(?:пятницу|пятница|пт|friday|fri)'), 5],
  [re('(?:в\\s+|во\\s+)?(?:субботу|суббота|сб|saturday|sat)'), 6],
];

export interface ParsedWhen {
  title: string;
  start?: Date;
  end?: Date;
  hasDate: boolean;
  hasTime: boolean;
}

export function parseWhen(input: string, now = new Date()): ParsedWhen {
  let text = ` ${input} `;
  let day: Date | undefined;
  let hour: number | undefined;
  let minute = 0;
  let durationMin = 60;
  let relative: Date | undefined;
  const take = (rx: RegExp): RegExpMatchArray | null => {
    const m = text.match(rx);
    if (m) text = text.replace(m[0], ' ');
    return m;
  };

  // Relative: "через 30 минут", "in 2 hours", "через 3 дня"
  let m = take(re('(?:через|in)\\s+(\\d+)\\s*(мин\\p{L}*|m|min\\p{L}*|час\\p{L}*|ч|h|hours?|д(?:ень|ня|ней)|days?)'));
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (/^(мин|m)/.test(unit)) relative = new Date(now.getTime() + n * 60_000);
    else if (/^(час|ч|h)/.test(unit)) relative = new Date(now.getTime() + n * 3_600_000);
    else day = addDays(startOfDay(now), n);
  }

  // Duration: "на 30 мин", "for 2h"
  m = take(re('(?:на|for)\\s+(\\d+)\\s*(мин\\p{L}*|m|min\\p{L}*|час\\p{L}*|ч|h|hours?)'));
  if (m) durationMin = Number(m[1]) * (/^(час|ч|h)/i.test(m[2]) ? 60 : 1);

  if (!day && take(re('послезавтра|day after tomorrow'))) day = addDays(startOfDay(now), 2);
  if (!day && take(re('завтра|tomorrow|tmr'))) day = addDays(startOfDay(now), 1);
  if (!day && take(re('сегодня|today|tonight'))) day = startOfDay(now);
  if (!day) {
    for (const [rx, wd] of WEEKDAYS) {
      if (take(rx)) {
        const diff = (wd - now.getDay() + 7) % 7 || 7;
        day = addDays(startOfDay(now), diff);
        break;
      }
    }
  }
  if (!day) {
    m = take(re('(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?'));
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
      day = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && day < startOfDay(now)) day.setFullYear(y + 1);
    }
  }

  // Time: "в 15", "в 15:30", "at 3pm", "15:30", "3pm"
  m = take(re('(?:в|at|@)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?'));
  if (!m) m = take(re('(\\d{1,2})[:](\\d{2})\\s*(am|pm)?'));
  if (!m) m = take(re('(\\d{1,2})\\s*(am|pm)'));
  if (m) {
    let h = Number(m[1]);
    const ampm = (m[3] ?? (m[2] && /am|pm/i.test(m[2]) ? m[2] : undefined))?.toLowerCase();
    const mm = m[2] && /^\d+$/.test(m[2]) ? Number(m[2]) : 0;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h <= 23 && mm <= 59) {
      hour = h;
      minute = mm;
    }
  }

  const title = text.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  if (relative) {
    return { title, start: relative, end: new Date(relative.getTime() + durationMin * 60_000), hasDate: true, hasTime: true };
  }
  if (hour !== undefined) {
    let base = day ?? startOfDay(now);
    const start = new Date(base);
    start.setHours(hour, minute, 0, 0);
    // "в 9" said at 18:00 without a date means tomorrow.
    if (!day && start < now) start.setDate(start.getDate() + 1);
    return { title, start, end: new Date(start.getTime() + durationMin * 60_000), hasDate: true, hasTime: true };
  }
  if (day) return { title, start: day, end: addDays(day, 1), hasDate: true, hasTime: false };
  return { title: input.trim(), hasDate: false, hasTime: false };
}

const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDayLabel(d: Date, now = new Date()): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const s = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "через 25 мин", "2 ч назад" */
export function fmtRelative(d: Date, now = new Date()): string {
  const sec = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(sec);
  if (abs < 60) return 'сейчас';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  return rtf.format(Math.round(sec / 86400), 'day');
}

/** Short timestamp for lists: "14:05" today, "12 нояб." otherwise. */
export function fmtShort(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return fmtTime(d);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** yyyy-MM-ddTHH:mm for <input type="datetime-local"> */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

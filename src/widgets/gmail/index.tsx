import { defineWidget, AuthRequiredError, type WidgetContext } from '../../shared/widget';
import { fmtShort } from '../../shared/dates';
import { Big, Empty, Header, IconArchive, IconButton, IconMailOpen, Row, Scroll, useOptimistic } from '../../ui/kit';

/**
 * Two modes:
 *  - lite (default): Gmail's Atom feed with the browser's own Google session. No OAuth, no setup,
 *    read-only, unread inbox only. Works in a Web Store build without Google verification.
 *  - api: Gmail API with gmail.modify (archive / mark as read). gmail.modify is a *restricted*
 *    scope: fine for your own OAuth client in "Testing" mode, needs a security audit for public use.
 */
interface Mail {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  link: string;
}
interface Data {
  mails: Mail[];
  unread: number;
  mode: 'lite' | 'api';
}
interface Config {
  mode: 'lite' | 'api';
  account: number;
  query: string;
}

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const AUTH = { provider: 'google' as const, scopes: SCOPES };
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" })[e as string] ?? '');
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '').trim();

async function fetchLite(ctx: WidgetContext<Config>): Promise<Data> {
  const n = Number(ctx.config.account) || 0;
  const xml = await ctx.http<string>(`https://mail.google.com/mail/u/${n}/feed/atom`, { as: 'text', credentials: 'include' });
  if (!xml.includes('<feed')) throw new Error('Войдите в Gmail в этом браузере');
  const entries = xml.split('<entry>').slice(1);
  const mails = entries.map((e) => {
    const author = e.match(/<author>([\s\S]*?)<\/author>/)?.[1] ?? '';
    const id = tag(e, 'id').split(':').pop() ?? tag(e, 'id');
    const href = decode(e.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '');
    const msgId = href.match(/message_id=([0-9a-f]+)/i)?.[1];
    return {
      id,
      from: tag(author, 'name') || tag(author, 'email'),
      subject: tag(e, 'title') || '(без темы)',
      snippet: tag(e, 'summary'),
      date: tag(e, 'issued') || tag(e, 'modified'),
      link: msgId ? `https://mail.google.com/mail/u/${n}/#inbox/${msgId}` : href,
    };
  });
  return { mails, unread: Number(tag(xml, 'fullcount')) || mails.length, mode: 'lite' };
}

async function fetchApi(ctx: WidgetContext<Config>): Promise<Data> {
  const n = Number(ctx.config.account) || 0;
  const q = ctx.config.query || 'in:inbox is:unread';
  const list = await ctx.http<{ messages?: { id: string; threadId: string }[]; resultSizeEstimate?: number }>(
    `${API}/messages?maxResults=15&q=${encodeURIComponent(q)}`,
    { auth: AUTH },
  );
  const msgs = await Promise.all(
    (list.messages ?? []).map((m) =>
      ctx.http<any>(`${API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { auth: AUTH }),
    ),
  );
  const header = (m: any, name: string) => m.payload?.headers?.find((h: any) => h.name === name)?.value ?? '';
  return {
    mode: 'api',
    unread: list.resultSizeEstimate ?? msgs.length,
    mails: msgs.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      from: header(m, 'From').replace(/\s*<.*>$/, '').replace(/^"|"$/g, ''),
      subject: header(m, 'Subject') || '(без темы)',
      snippet: decode(m.snippet ?? ''),
      date: new Date(Number(m.internalDate)).toISOString(),
      link: `https://mail.google.com/mail/u/${n}/#inbox/${m.threadId}`,
    })),
  };
}

const modify = (ctx: WidgetContext<Config>, id: string, removeLabelIds: string[]) => {
  if (ctx.config.mode !== 'api') throw new AuthRequiredError('google', 'Включите режим «Gmail API» в настройках виджета');
  return ctx.http(`${API}/messages/${id}/modify`, { method: 'POST', auth: AUTH, json: { removeLabelIds } });
};

export default defineWidget<Data, Config>({
  id: 'gmail',
  name: 'Gmail',
  description: 'Непрочитанные письма. В режиме API: архив и «прочитано».',
  icon: '✉️',
  sizes: ['S', 'M', 'L', 'XL'],
  defaultSize: 'XL',
  auth: (c) => (c.mode === 'api' ? AUTH : undefined),
  refreshMinutes: 3,
  settings: [
    {
      key: 'mode',
      label: 'Режим',
      type: 'select',
      default: 'lite',
      options: [
        { value: 'lite', label: 'Простой (без настройки, только чтение)' },
        { value: 'api', label: 'Gmail API (архив, «прочитано»; нужен свой OAuth-клиент)' },
      ],
    },
    { key: 'account', label: 'Номер аккаунта (u/N)', type: 'number', default: 0, help: '0 — первый вошедший аккаунт Google' },
    { key: 'query', label: 'Фильтр (режим API)', type: 'text', default: 'in:inbox is:unread' },
  ],

  fetch: (ctx) => (ctx.config.mode === 'api' ? fetchApi(ctx) : fetchLite(ctx)),

  actions: {
    archive: (ctx, p: { id: string }) => modify(ctx, p.id, ['INBOX']),
    markRead: (ctx, p: { id: string }) => modify(ctx, p.id, ['UNREAD']),
  },

  View({ data, size, run, open, config }) {
    const { hidden, hide, restore } = useOptimistic();
    const mails = (data?.mails ?? []).filter((m) => !hidden.has(m.id));
    const n = Number(config.account) || 0;
    const inbox = () => open(`https://mail.google.com/mail/u/${n}/#inbox`);
    const canModify = data?.mode === 'api';
    const act = (m: Mail, action: 'archive' | 'markRead') => {
      hide(m.id);
      run(action, { id: m.id }).catch(() => restore(m.id));
    };
    const unread = Math.max(0, (data?.unread ?? 0) - hidden.size);

    if (size === 'S') {
      return (
        <div class="k-pad k-clickable" onClick={inbox}>
          <Header title="Gmail" icon="✉️" />
          <Big sub={mails[0] ? `${mails[0].from}: ${mails[0].subject}` : 'Входящие пусты'}>{unread}</Big>
        </div>
      );
    }
    return (
      <div class="k-pad k-col">
        <Header title="Gmail" icon="✉️" onClick={inbox} right={<span class="k-count">{unread || ''}</span>} />
        <Scroll>
          {mails.length === 0 && <Empty icon="📭">Нет непрочитанных</Empty>}
          {mails.slice(0, size === 'M' ? 2 : 20).map((m) => (
            <Row
              key={m.id}
              title={
                <>
                  <b>{m.from}</b> <span class="k-sep">·</span> {m.subject}
                </>
              }
              subtitle={size === 'M' ? undefined : m.snippet}
              meta={m.date ? fmtShort(new Date(m.date)) : ''}
              onClick={() => open(m.link)}
              actions={
                canModify ? (
                  <>
                    <IconButton title="Прочитано" onClick={() => act(m, 'markRead')}><IconMailOpen /></IconButton>
                    <IconButton title="В архив" onClick={() => act(m, 'archive')}><IconArchive /></IconButton>
                  </>
                ) : undefined
              }
            />
          ))}
        </Scroll>
      </div>
    );
  },
});

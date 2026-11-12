import { useState } from 'preact/hooks';
import { defineWidget } from '../../shared/widget';
import { favicon, targetTab } from '../../ui/env';
import { AddInput, Button, IconPlus, IconX } from '../../ui/kit';

interface Config {
  links: string;
}
interface Link {
  title: string;
  url: string;
}

function parse(text: string): Link[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, b] = l.split('|').map((s) => s.trim());
      const url = b ?? a;
      const full = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
      let title = b ? a : url;
      try {
        if (!b) title = new URL(full).hostname.replace(/^www\./, '');
      } catch {}
      return { title, url: full };
    });
}
const serialize = (links: Link[]) => links.map((l) => `${l.title.replace(/\|/g, '/')} | ${l.url}`).join('\n');

function titleFor(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.').slice(-2, -1)[0] ?? host;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

/** Quick links: no network, no auth. Links are added right from the tile (current tab or a pasted URL). */
export default defineWidget<void, Config>({
  id: 'links',
  name: 'Быстрые ссылки',
  description: 'Сетка избранных сайтов. Добавляйте текущую вкладку или любой адрес прямо с плитки.',
  icon: '🔖',
  sizes: ['S', 'M', 'L', 'XL'],
  defaultSize: 'M',
  settings: [
    {
      key: 'links',
      label: 'Ссылки (по одной в строке: «Название | адрес»)',
      type: 'textarea',
      default: 'GitHub | github.com\nYouTube | youtube.com\nFigma | figma.com\nNotion | notion.so',
    },
  ],
  View({ config, open, setConfig }) {
    const links = parse(config.links ?? '');
    const [adding, setAdding] = useState(false);
    const [current, setCurrent] = useState<chrome.tabs.Tab | null>(null);
    const save = (next: Link[]) => setConfig({ links: serialize(next) });
    const startAdding = async () => {
      setAdding(true);
      const t = await targetTab();
      setCurrent(t?.url && /^https?:/.test(t.url) && !links.some((l) => l.url === t.url) ? t : null);
    };
    const addUrl = async (raw: string) => {
      const url = /^[a-z]+:/i.test(raw) ? raw : `https://${raw}`;
      new URL(url); // throws on garbage
      await save([...links, { title: titleFor(url), url }]);
      setAdding(false);
    };

    if (adding) {
      return (
        <div class="k-pad k-col k-links-add">
          {current && (
            <Button primary onClick={async () => { await save([...links, { title: current.title || titleFor(current.url!), url: current.url! }]); setAdding(false); }}>
              <img src={favicon(current.url!, 32)} width={14} height={14} alt="" /> Добавить «{(current.title || current.url!).slice(0, 40)}»
            </Button>
          )}
          <AddInput autoFocus placeholder="Вставьте адрес: github.com" onSubmit={addUrl} onCancel={() => setAdding(false)} />
        </div>
      );
    }

    return (
      <div class="k-links">
        {links.map((l, i) => (
          <div key={l.url + i} class="k-link-wrap">
            <button class="k-link" title={l.url} onClick={() => open(l.url)}>
              <img src={favicon(l.url, 64)} alt="" width={28} height={28} />
              <span>{l.title}</span>
            </button>
            <button class="k-link-remove" title="Убрать" onClick={(e) => { e.stopPropagation(); save(links.filter((_, j) => j !== i)); }}>
              <IconX size={10} />
            </button>
          </div>
        ))}
        <button class="k-link k-link-new" title="Добавить ссылку" onClick={startAdding}>
          <span class="k-link-plus"><IconPlus size={16} /></span>
          <span>Добавить</span>
        </button>
      </div>
    );
  },
});

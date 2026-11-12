import { defineWidget } from '../../shared/widget';
import { favicon } from '../../ui/env';
import { Empty } from '../../ui/kit';

interface Config {
  links: string;
}

function parse(text: string) {
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

/** Quick links: no network, no auth. A good minimal example of a widget with settings. */
export default defineWidget<void, Config>({
  id: 'links',
  name: 'Быстрые ссылки',
  description: 'Сетка избранных сайтов.',
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
  View({ config, size, open }) {
    const links = parse(config.links ?? '');
    const max = { S: 4, M: 8, L: 16, XL: 16 }[size];
    if (!links.length) return <Empty>Добавьте ссылки в настройках виджета</Empty>;
    return (
      <div class={`k-links k-links-${size}`}>
        {links.slice(0, max).map((l) => (
          <button key={l.url} class="k-link" title={l.url} onClick={() => open(l.url)}>
            <img src={favicon(l.url, 64)} alt="" width={28} height={28} />
            {size !== 'S' && <span>{l.title}</span>}
          </button>
        ))}
      </div>
    );
  },
});

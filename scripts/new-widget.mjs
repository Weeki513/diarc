// Scaffold a widget: npm run new-widget -- my-widget "My Widget"
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const [id, name = id] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('Usage: npm run new-widget -- <kebab-id> ["Display name"]');
  process.exit(1);
}
const dir = `src/widgets/${id}`;
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}/index.tsx`,
  `import { defineWidget } from '../../shared/widget';
import { Big, Empty, Header, Row, Scroll } from '../../ui/kit';

interface Data {
  items: { id: string; title: string; url?: string }[];
}
interface Config {
  query: string;
}

export default defineWidget<Data, Config>({
  id: '${id}',
  name: '${name}',
  description: 'Describe what this widget shows.',
  icon: '✨',
  sizes: ['S', 'M', 'L'],
  defaultSize: 'M',
  refreshMinutes: 15,
  settings: [{ key: 'query', label: 'Query', type: 'text', default: '' }],

  // Runs in the service worker. Return plain JSON; it is cached and rendered instantly on open.
  async fetch(ctx) {
    // const res = await ctx.http('https://api.example.com/items?q=' + encodeURIComponent(ctx.config.query));
    return { items: [{ id: '1', title: 'Hello from ${id}' }] };
  },

  // Optional mutations, called from the View with run('name', payload). Data refreshes afterwards.
  actions: {},

  View({ data, size, open }) {
    const items = data?.items ?? [];
    if (size === 'S') return <div class="k-pad"><Header title="${name}" icon="✨" /><Big>{items.length}</Big></div>;
    return (
      <div class="k-pad k-col">
        <Header title="${name}" icon="✨" />
        <Scroll>
          {items.length === 0 && <Empty>Nothing here</Empty>}
          {items.map((it) => <Row key={it.id} title={it.title} onClick={it.url ? () => open(it.url!) : undefined} />)}
        </Scroll>
      </div>
    );
  },
});
`,
);
console.log(`✓ Created ${dir}/index.tsx — run "npm run build" and add it from the bar (▦ → +).`);

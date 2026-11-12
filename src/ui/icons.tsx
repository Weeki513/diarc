/** Inline SVG icons (stroke = currentColor). */
import type { JSX } from 'preact';

const P = (d: string | JSX.Element) => (props: { size?: number }) => (
  <svg width={props.size ?? 15} height={props.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

export const IconSearch = P(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconPlus = P('M12 5v14M5 12h14');
export const IconX = P('M18 6 6 18M6 6l12 12');
export const IconCheck = P('M20 6 9 17l-5-5');
export const IconTrash = P('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6');
export const IconPencil = P('M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z');
export const IconArchive = P(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>);
export const IconMailOpen = P(<><path d="M21 8v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8l9-5Z" /><path d="m3 8 9 6 9-6" /></>);
export const IconRefresh = P('M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5');
export const IconSettings = P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const IconResize = P('M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7');
export const IconExternal = P('M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
export const IconGrid = P(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IconGlobe = P(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>);
export const IconClock = P(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconStar = P('m12 3 2.8 5.6 6.2.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.2-.9Z');
export const IconTab = P(<><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18" /></>);
export const IconBolt = P('M13 2 4 14h7l-1 8 9-12h-7Z');

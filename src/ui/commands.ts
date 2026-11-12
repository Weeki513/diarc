/** Built-in command bar commands (tab management etc). */
import { closeBar, openUrl, targetTab } from './env';

export interface Command {
  id: string;
  title: string;
  keywords: string;
  icon: string;
  /** Return a string to show as a toast; the bar stays open. Otherwise it closes. */
  run(): Promise<string | void>;
}

async function current() {
  const t = await targetTab();
  if (!t?.id) throw new Error('Нет активной вкладки');
  return t as chrome.tabs.Tab & { id: number };
}

export function builtinCommands(hooks: { editWidgets(): void; refreshWidgets(): void }): Command[] {
  return [
    {
      id: 'close-tab',
      title: 'Закрыть вкладку',
      keywords: 'close tab закрыть',
      icon: '✕',
      async run() {
        const t = await current();
        closeBar();
        await chrome.tabs.remove(t.id);
      },
    },
    {
      id: 'duplicate',
      title: 'Дублировать вкладку',
      keywords: 'duplicate tab копия дубль',
      icon: '⧉',
      async run() {
        const t = await current();
        closeBar();
        await chrome.tabs.duplicate(t.id);
      },
    },
    {
      id: 'pin',
      title: 'Закрепить / открепить вкладку',
      keywords: 'pin unpin tab закрепить открепить',
      icon: '📌',
      async run() {
        const t = await current();
        closeBar();
        await chrome.tabs.update(t.id, { pinned: !t.pinned });
      },
    },
    {
      id: 'reload',
      title: 'Перезагрузить вкладку',
      keywords: 'reload refresh обновить перезагрузить',
      icon: '↻',
      async run() {
        const t = await current();
        closeBar();
        await chrome.tabs.reload(t.id);
      },
    },
    {
      id: 'copy-url',
      title: 'Скопировать ссылку на страницу',
      keywords: 'copy url link скопировать ссылку адрес',
      icon: '🔗',
      async run() {
        const t = await current();
        await navigator.clipboard.writeText(t.url ?? '');
        return 'Ссылка скопирована';
      },
    },
    {
      id: 'close-duplicates',
      title: 'Закрыть дубликаты вкладок',
      keywords: 'close duplicate tabs дубликаты закрыть',
      icon: '🧹',
      async run() {
        const seen = new Set<string>();
        const dupes: number[] = [];
        for (const t of await chrome.tabs.query({ windowType: 'normal' })) {
          const key = t.url?.split('#')[0] ?? '';
          if (seen.has(key) && !t.pinned && !t.active) dupes.push(t.id!);
          else seen.add(key);
        }
        if (dupes.length) await chrome.tabs.remove(dupes);
        return dupes.length ? `Закрыто вкладок: ${dupes.length}` : 'Дубликатов нет';
      },
    },
    {
      id: 'close-others',
      title: 'Закрыть остальные вкладки',
      keywords: 'close other tabs закрыть остальные другие',
      icon: '⊟',
      async run() {
        const t = await current();
        const others = (await chrome.tabs.query({ windowId: t.windowId, pinned: false })).filter((x) => x.id !== t.id);
        closeBar();
        await chrome.tabs.remove(others.map((x) => x.id!));
      },
    },
    {
      id: 'move-window',
      title: 'Перенести вкладку в новое окно',
      keywords: 'move tab new window перенести окно',
      icon: '⧈',
      async run() {
        const t = await current();
        closeBar();
        await chrome.windows.create({ tabId: t.id, focused: true });
      },
    },
    {
      id: 'new-window',
      title: 'Новое окно',
      keywords: 'new window новое окно',
      icon: '▢',
      async run() {
        closeBar();
        await chrome.windows.create({ focused: true });
      },
    },
    {
      id: 'history',
      title: 'Открыть историю',
      keywords: 'history история',
      icon: '🕘',
      run: () => openUrl('chrome://history'),
    },
    {
      id: 'bookmarks',
      title: 'Открыть закладки',
      keywords: 'bookmarks закладки',
      icon: '★',
      run: () => openUrl('chrome://bookmarks'),
    },
    {
      id: 'downloads',
      title: 'Открыть загрузки',
      keywords: 'downloads загрузки',
      icon: '⇣',
      run: () => openUrl('chrome://downloads'),
    },
    {
      id: 'edit-widgets',
      title: 'Изменить виджеты',
      keywords: 'edit widgets изменить виджеты плитки настроить',
      icon: '▦',
      async run() {
        hooks.editWidgets();
        return '';
      },
    },
    {
      id: 'refresh-widgets',
      title: 'Обновить виджеты',
      keywords: 'refresh widgets обновить виджеты',
      icon: '⟳',
      async run() {
        hooks.refreshWidgets();
        return 'Обновляю…';
      },
    },
    {
      id: 'settings',
      title: 'Настройки Diarc',
      keywords: 'settings preferences настройки diarc',
      icon: '⚙',
      async run() {
        closeBar();
        await chrome.runtime.openOptionsPage();
      },
    },
    {
      id: 'shortcuts',
      title: 'Сочетания клавиш расширений',
      keywords: 'shortcuts hotkeys keyboard сочетания клавиши горячие',
      icon: '⌨',
      run: () => openUrl('chrome://extensions/shortcuts'),
    },
  ];
}

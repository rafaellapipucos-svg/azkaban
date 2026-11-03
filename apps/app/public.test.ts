import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import appConfig from './app.config';
import { reportOnlyCsp, withReportOnlyCsp } from './scripts/headers';
// Tailwind reads the tokens of packages/ui, which this app may only reach through its config.
import tailwind from './tailwind.config';

const file = (name: string) => readFileSync(new URL(`./public/${name}`, import.meta.url), 'utf8');
const { background, 'background-dark': backgroundDark, primary } = tailwind.theme.extend.colors;

describe('public files', () => {
  it('repeat the background tokens in index.html, light and dark', () => {
    const html = file('index.html').toLowerCase();
    const themeColor = (scheme: string) =>
      html.match(
        new RegExp(
          `name="theme-color" media="\\(prefers-color-scheme: ${scheme}\\)" content="(#[0-9a-f]{6})"`,
        ),
      )?.[1];
    expect(themeColor('light')).toBe(background.toLowerCase());
    expect(themeColor('dark')).toBe(backgroundDark.toLowerCase());
    const fills = [...html.matchAll(/background-color: (#[0-9a-f]{6})/g)].map((match) => match[1]);
    expect(fills).toEqual([background.toLowerCase(), backgroundDark.toLowerCase()]);
  });

  it('repeat the light background in the manifest', () => {
    const manifest = JSON.parse(file('manifest.webmanifest'));
    expect(manifest.background_color).toBe(background);
    expect(manifest.theme_color).toBe(background);
  });

  it('send the security headers on every route (ADR-0008, section 17)', () => {
    const blocks = file('_headers')
      .replace(/\r/g, '')
      .split(/\n(?=\S)/);
    const all = blocks.find((block) => block.startsWith('/*\n'));
    expect(all).toContain(
      "  Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    expect(all).toContain('  X-Content-Type-Options: nosniff');
    expect(all).toContain('  Referrer-Policy: strict-origin-when-cross-origin');
  });
});

describe('report-only CSP (ADR-0012, section 13, item 1)', () => {
  const host = 'https://abcdefghij.supabase.co';

  it('names the exact Supabase host, for HTTP and Realtime, and no wildcard', () => {
    const policy = reportOnlyCsp(`${host}/`);
    expect(policy).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        `img-src 'self' data: blob: ${host}; ` +
        `connect-src 'self' ${host} wss://abcdefghij.supabase.co; ` +
        "font-src 'self' data:; worker-src 'self'; manifest-src 'self'; " +
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    expect(policy).not.toContain('*');
    expect(reportOnlyCsp('http://127.0.0.1:54321')).toContain(
      "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321;",
    );
  });

  it('refuses a URL that is not http or https', () => {
    expect(() => reportOnlyCsp('javascript:alert(1)')).toThrow();
    expect(() => reportOnlyCsp('not a url')).toThrow();
  });

  it('adds it next to the enforced one in _headers, which stays as it was', () => {
    const headers = file('_headers');
    const built = withReportOnlyCsp(headers, host);
    const all = built.split(/\n(?=\S)/).find((block) => block.startsWith('/*\n'));
    expect(all).toContain(
      "  Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'\n" +
        `  Content-Security-Policy-Report-Only: ${reportOnlyCsp(host)}\n`,
    );
    expect(built.match(/Content-Security-Policy-Report-Only/g)).toHaveLength(1);
    expect(built).not.toMatch(/^\s*Content-Security-Policy: default-src/m);
    expect(built.replace(/\n {2}Content-Security-Policy-Report-Only: .*/, '')).toBe(
      headers.replace(/\r/g, ''),
    );
  });
});

describe('app.config.ts', () => {
  it('repeats the color tokens', () => {
    const plugin = (name: string) =>
      (appConfig.plugins ?? []).find((each) => Array.isArray(each) && each[0] === name)?.[1];
    expect(appConfig.android?.adaptiveIcon?.backgroundColor).toBe(background);
    expect(plugin('expo-splash-screen')).toMatchObject({
      backgroundColor: background,
      dark: { backgroundColor: backgroundDark },
    });
    expect(plugin('expo-notifications')).toMatchObject({ color: primary });
  });
});

type Listener = (event: Record<string, unknown>) => void;

/** Runs sw.js against fake service worker globals and returns what it registered. */
function loadWorker(windows: { url: string; navigate?: () => Promise<void> }[] = []) {
  const listeners: Record<string, Listener> = {};
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (type: string, listener: Listener) => (listeners[type] = listener),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      matchAll: vi.fn(async () =>
        windows.map((each) => ({
          focus: vi.fn(async () => {}),
          navigate: vi.fn(async () => {}),
          ...each,
        })),
      ),
      openWindow: vi.fn(async () => {}),
    },
  };
  runInNewContext(file('sw.js'), { self, URL });
  const fire = async (type: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners[type]?.({ ...event, waitUntil: (promise: Promise<unknown>) => (done = promise) });
    await done;
  };
  return { self, listeners, fire };
}

const pushOf = (body: unknown) => ({
  data: {
    json: () => (typeof body === 'string' ? JSON.parse(body) : body),
  },
});

describe('sw.js', () => {
  it('has no fetch handler', () => {
    expect(loadWorker().listeners.fetch).toBeUndefined();
  });

  it('shows the payload, keeping only an internal path to open', async () => {
    const worker = loadWorker();
    const payload = {
      v: 1,
      title: 'Academia',
      body: 'Está na hora.',
      tag: 'n1',
      url: '/tasks/1/proof',
    };
    await worker.fire('push', pushOf(payload));
    await worker.fire('push', pushOf({ ...payload, url: '//evil.example' }));
    const calls = worker.self.registration.showNotification.mock.calls as unknown[][];
    expect(calls[0]).toEqual([
      'Academia',
      expect.objectContaining({
        body: 'Está na hora.',
        tag: 'n1',
        data: { url: '/tasks/1/proof' },
      }),
    ]);
    expect(calls[1]?.[1]).toMatchObject({ data: { url: '/' } });
  });

  it('opens only a path of its own origin, even one the URL parser would rewrite', async () => {
    const worker = loadWorker();
    const urls = [
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '//evil.com',
      '/\\evil.com',
      `/${'a'.repeat(200)}`,
      '/tasks/1/proof',
    ];
    for (const url of urls) {
      await worker.fire('push', pushOf({ v: 1, title: 'x', url }));
    }
    const opened = (worker.self.registration.showNotification.mock.calls as unknown[][]).map(
      (call) => (call[1] as { data: { url: string } }).data.url,
    );
    expect(opened).toEqual(['/', '/', '/', '/', '/', '/', '/tasks/1/proof']);
  });

  it('always shows something, even for a payload it cannot read', async () => {
    const worker = loadWorker();
    await worker.fire('push', pushOf('not json'));
    await worker.fire('push', {});
    await worker.fire('push', pushOf({ v: 2, title: 'x' }));
    expect(worker.self.registration.showNotification).toHaveBeenCalledTimes(3);
  });

  it('opens the path in a window of the app, or in a new one', async () => {
    const notification = { close: vi.fn(), data: { url: '/proofs/9' } };
    const reused = loadWorker([{ url: 'https://app.example/' }]);
    await reused.fire('notificationclick', { notification });
    const [client] = await reused.self.clients.matchAll.mock.results[0]!.value;
    expect(client.navigate).toHaveBeenCalledWith('https://app.example/proofs/9');
    expect(reused.self.clients.openWindow).not.toHaveBeenCalled();

    const uncontrolled = loadWorker([
      {
        url: 'https://app.example/',
        navigate: () => Promise.reject(new TypeError('not controlled')),
      },
    ]);
    await uncontrolled.fire('notificationclick', { notification });
    expect(uncontrolled.self.clients.openWindow).toHaveBeenCalledWith(
      'https://app.example/proofs/9',
    );

    const none = loadWorker([{ url: 'https://other.example/' }]);
    await none.fire('notificationclick', {
      notification: { close: vi.fn(), data: { url: 'https://evil' } },
    });
    expect(none.self.clients.openWindow).toHaveBeenCalledWith('https://app.example/');
    expect(notification.close).toHaveBeenCalled();
  });
});

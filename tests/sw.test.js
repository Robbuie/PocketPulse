// The service worker, run against fake caches and a fake network. What
// matters: a page still opens offline, a new deploy is picked up when online,
// built files come from the cache, and Supabase traffic is never touched.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');
const ORIGIN = 'https://pocketpulse.example';

function fakeCaches() {
  const stores = new Map();
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (r) => m.get(keyOf(r)),
      put: async (r, res) => { m.set(keyOf(r), res); },
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (r) => m.delete(keyOf(r)),
    };
  };
  return { open, keys: async () => [...stores.keys()], delete: async (k) => stores.delete(k), stores };
}

const res = (body) => ({ ok: true, body, clone() { return res(body); } });

let handlers, network, online, caches;
beforeEach(() => {
  handlers = {};
  network = new Map();
  online = true;
  caches = fakeCaches();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  const fetch = async (req) => {
    if (!online) throw new TypeError('offline');
    return res(network.get(req.url) ?? 'none');
  };
  new Function('self', 'caches', 'fetch', 'URL', source)(self, caches, fetch, URL);
});

function request(path, mode = 'cors') {
  let responded = null;
  handlers.fetch({
    request: { method: 'GET', url: new URL(path, ORIGIN).href, mode },
    respondWith: (p) => { responded = p; },
  });
  return responded;
}

describe('service worker', () => {
  it('serves the last page when offline, and a new one when online', async () => {
    network.set(`${ORIGIN}/`, 'page v1');
    expect((await request('/', 'navigate')).body).toBe('page v1');
    online = false;
    expect((await request('/budget', 'navigate')).body).toBe('page v1');
    online = true;
    network.set(`${ORIGIN}/`, 'page v2');
    expect((await request('/', 'navigate')).body).toBe('page v2');
  });

  it('serves built files from the cache once fetched', async () => {
    network.set(`${ORIGIN}/assets/index-abc.js`, 'code');
    expect((await request('/assets/index-abc.js')).body).toBe('code');
    online = false;
    expect((await request('/assets/index-abc.js')).body).toBe('code');
  });

  it('leaves Supabase and other sites alone', () => {
    expect(request('https://xyz.supabase.co/rest/v1/debts')).toBeNull();
    expect(request('https://unpkg.com/tesseract.js@4/dist/tesseract.min.js')).toBeNull();
  });

  it('leaves writes alone', () => {
    let responded = null;
    handlers.fetch({ request: { method: 'POST', url: `${ORIGIN}/x`, mode: 'cors' }, respondWith: (p) => { responded = p; } });
    expect(responded).toBeNull();
  });
});

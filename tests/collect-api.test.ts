import { describe, expect, it } from 'vitest';
import { COOLDOWN_MS, createHandler, sameOriginProblem } from '../scripts/collect-api';

const OK_HEADERS = { host: 'localhost:5173', 'x-requested-with': 'update-button' };
const req = (method = 'POST', addr = '127.0.0.1', headers: Record<string, string> = OK_HEADERS) => ({ method, socket: { remoteAddress: addr }, headers }) as never;

describe('POST /api/collect', () => {
  it('runs on POST from loopback and returns the log', async () => {
    const h = createHandler(async () => ({ ok: true, log: 'items=3' }));
    expect(await h(req())).toEqual({ status: 200, body: { ok: true, log: 'items=3' } });
  });
  it('reports failure as 500', async () => {
    const h = createHandler(async () => ({ ok: false, log: '中断' }));
    expect((await h(req())).status).toBe(500);
  });
  it('rejects non-POST and non-local requests without running', async () => {
    let n = 0;
    const h = createHandler(async () => (n++, { ok: true, log: '' }));
    expect((await h(req('GET'))).status).toBe(405);
    expect((await h(req('POST', '192.168.0.5'))).status).toBe(403);
    expect(n).toBe(0);
  });
  it('rejects a concurrent run', async () => {
    let release!: () => void;
    const h = createHandler(() => new Promise((r) => (release = () => r({ ok: true, log: '' }))));
    const first = h(req());
    expect((await h(req())).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
  it('enforces a cooldown after a run, then allows again', async () => {
    let t = 1000;
    const h = createHandler(async () => ({ ok: true, log: '' }), () => t);
    await h(req());
    t += 1000;
    expect((await h(req())).status).toBe(429);
    t += COOLDOWN_MS;
    expect((await h(req())).status).toBe(200);
  });
  it('allows ::1 and ::ffff:127.0.0.1, rejects a missing address', async () => {
    const h = createHandler(async () => ({ ok: true, log: '' }), () => 0);
    expect((await h(req('POST', '::1'))).status).toBe(200);
    const h2 = createHandler(async () => ({ ok: true, log: '' }), () => 0);
    expect((await h2(req('POST', '::ffff:127.0.0.1'))).status).toBe(200);
    expect((await h2(req('POST', ''))).status).toBe(403);
  });
  it('turns a throwing runner into 500 and releases the lock; failures also start the cooldown', async () => {
    let t = 1000;
    let boom = true;
    const h = createHandler(async () => {
      if (boom) throw new Error('spawn failed');
      return { ok: true, log: '' };
    }, () => t);
    expect((await h(req())).status).toBe(500);
    t += 1000;
    expect((await h(req())).status).toBe(429);
    boom = false;
    t += COOLDOWN_MS;
    expect((await h(req())).status).toBe(200);
  });
  it('rejected requests do not start the cooldown or run', async () => {
    let n = 0;
    const h = createHandler(async () => (n++, { ok: true, log: '' }), () => 0);
    await h(req('POST', '192.168.0.5'));
    await h(req('GET'));
    expect((await h(req())).status).toBe(200);
    expect(n).toBe(1);
  });
});

describe('same-origin check (CSRF / DNS rebinding)', () => {
  const ok = { host: 'localhost:5173', 'x-requested-with': 'update-button' };
  it('accepts a same-origin request', () => {
    expect(sameOriginProblem(ok)).toBeNull();
    expect(sameOriginProblem({ ...ok, origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' })).toBeNull();
    expect(sameOriginProblem({ ...ok, host: '127.0.0.1:5173' })).toBeNull();
  });
  it('rejects foreign Host (rebinding), foreign Origin, cross-site, and a missing custom header', () => {
    expect(sameOriginProblem({ ...ok, host: 'evil.example:5173' })).not.toBeNull();
    expect(sameOriginProblem({ ...ok, origin: 'https://evil.example' })).not.toBeNull();
    expect(sameOriginProblem({ ...ok, 'sec-fetch-site': 'cross-site' })).not.toBeNull();
    expect(sameOriginProblem({ host: 'localhost:5173' })).not.toBeNull();
  });
});

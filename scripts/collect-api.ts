// 開発サーバ限定の `POST /api/collect`: `npm run collect` → `npm run candidates` を順に実行して結果を返す。
// 実行するコマンドは固定(リクエストから引数を受け取らない)。ローカル接続のみ許可し、同時実行1・連続実行の最短間隔を設ける(docs/operations.md §4)。
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export const COOLDOWN_MS = 5 * 60 * 1000;
const STEP_TIMEOUT_MS = 10 * 60 * 1000;
const OUT_MAX = 16 * 1024;
/** フロントが付けるカスタムヘッダ。付けられるのは同一オリジンのスクリプトだけ(他サイトからは preflight で弾かれる) */
const REQUEST_HEADER = 'x-requested-with';
const REQUEST_HEADER_VALUE = 'update-button';
const STEPS: readonly (readonly string[])[] = [['run', 'collect'], ['run', 'candidates']];
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

interface RunResult {
  ok: boolean;
  /** 各ステップの出力の末尾(画面表示用) */
  log: string;
}
export type Runner = () => Promise<RunResult>;

function npmRunner(cwd: string = process.cwd()): Runner {
  const run = (args: readonly string[]): Promise<{ code: number; out: string }> =>
    new Promise((resolve) => {
      let out = '';
      const add = (d: Buffer): void => {
        out = (out + d.toString()).slice(-OUT_MAX);
      };
      let p: ReturnType<typeof spawn>;
      try {
        p = spawn('npm', [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        resolve({ code: 1, out: String(e) });
        return;
      }
      p.stdout?.on('data', add);
      p.stderr?.on('data', add);
      const timer = setTimeout(() => {
        out += `\nタイムアウト(${STEP_TIMEOUT_MS / 60000}分)で中断しました`;
        p.kill('SIGTERM');
      }, STEP_TIMEOUT_MS);
      p.on('error', (e) => resolve({ code: 1, out: out + String(e) }));
      p.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, out });
      });
    });
  return async () => {
    let log = '';
    for (const step of STEPS) {
      const r = await run(step);
      log += r.out;
      if (r.code !== 0) return { ok: false, log: tail(log) };
    }
    return { ok: true, log: tail(log) };
  };
}

const tail = (s: string, n = 12): string =>
  s
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('>'))
    .slice(-n)
    .join('\n');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostname = (host: string): string => host.replace(/:\d+$/, '').toLowerCase();

/** 他サイトからのリクエスト(CSRF)・DNS rebinding を弾く。通常の同一オリジンの fetch のみ通す */
export function sameOriginProblem(h: IncomingMessage['headers']): string | null {
  const host = String(h.host ?? '');
  if (!LOCAL_HOSTS.has(hostname(host))) return 'Host がローカルではありません';
  if (h.origin !== undefined) {
    try {
      if (new URL(String(h.origin)).host !== host) return 'Origin が一致しません';
    } catch {
      return 'Origin が不正です';
    }
  }
  const site = h['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 'クロスサイトのリクエストです';
  if (h[REQUEST_HEADER] !== REQUEST_HEADER_VALUE) return 'リクエストヘッダがありません';
  return null;
}

export interface Handler {
  (req: Pick<IncomingMessage, 'method' | 'socket' | 'headers'>): Promise<{ status: number; body: Record<string, unknown> }>;
}

export function createHandler(runner: Runner, now: () => number = Date.now): Handler {
  let running = false;
  let lastEnd = 0;
  return async (req) => {
    if (req.method !== 'POST') return { status: 405, body: { ok: false, error: 'POST のみ' } };
    if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return { status: 403, body: { ok: false, error: 'ローカル接続のみ' } };
    if (running) return { status: 409, body: { ok: false, error: '実行中です' } };
    const wait = lastEnd + COOLDOWN_MS - now();
    if (lastEnd > 0 && wait > 0) return { status: 429, body: { ok: false, error: `連続実行を避けるため、あと${Math.ceil(wait / 1000)}秒待ってください` } };
    const bad = sameOriginProblem(req.headers ?? {});
    if (bad) return { status: 403, body: { ok: false, error: bad } };
    running = true;
    try {
      const r = await runner();
      return { status: r.ok ? 200 : 500, body: { ...r } };
    } catch (e) {
      return { status: 500, body: { ok: false, error: String(e) } };
    } finally {
      running = false;
      lastEnd = now();
    }
  };
}

export function collectApi(runner: Runner = npmRunner()): Plugin {
  const handle = createHandler(runner);
  return {
    name: 'collect-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url?.split('?')[0] !== '/api/collect') return next();
        void handle(req)
          .catch((e: unknown) => ({ status: 500, body: { ok: false, error: String(e) } }))
          .then(({ status, body }) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          });
      });
    },
  };
}

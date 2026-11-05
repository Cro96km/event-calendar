// 礼節付きHTTPクライアント。正本: docs/operations.md §4。
import { isAllowed } from './robots';

export const USER_AGENT = 'monst-event-calendar (personal, non-commercial)';

export class RateLimitedError extends Error {
  constructor(readonly retryAfter: string | null) {
    super(`429 Too Many Requests (Retry-After: ${retryAfter ?? 'なし'})`);
  }
}
export class DisallowedError extends Error {}
export class ServerError extends Error {}

export type FetchResult = { status: 'ok'; body: string } | { status: 'not_found' };

export interface FetcherOptions {
  intervalMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  disallow?: string[];
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class Fetcher {
  private last = -Infinity;
  private readonly o: Required<FetcherOptions>;

  constructor(options: FetcherOptions = {}) {
    this.o = {
      intervalMs: 2000,
      maxRetries: 3,
      backoffMs: 2000,
      disallow: [],
      fetchFn: fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: Date.now,
      ...options,
    };
  }

  setDisallow(rules: string[]): void {
    this.o.disallow = rules;
  }

  /** 並列1・間隔N ms を保証するため、呼び出しは逐次 await すること。 */
  async get(url: string): Promise<FetchResult> {
    if (!isAllowed(new URL(url).pathname, this.o.disallow)) throw new DisallowedError(url);
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.o.intervalMs - this.o.now();
      if (wait > 0) await this.o.sleep(wait);
      this.last = this.o.now();
      let res: Response | null = null;
      try {
        res = await this.o.fetchFn(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' }, redirect: 'manual' });
      } catch {
        // ネットワーク障害は5xx扱い
      }
      if (res?.ok) return { status: 'ok', body: await res.text() };
      if (res?.status === 404) return { status: 'not_found' };
      if (res?.status === 429) throw new RateLimitedError(res.headers.get('Retry-After'));
      // 3xx は追従しない（追従先に robots/間隔制御が効かないため）
      if (res && res.status < 500) throw new Error(`HTTP ${res.status}: ${url}`);
      if (attempt >= this.o.maxRetries) throw new ServerError(`${res?.status ?? 'network error'}: ${url}`);
      await this.o.sleep(this.o.backoffMs * 2 ** attempt);
    }
  }
}

import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RawCache } from '../src/scraper/cache';
import { htmlToLines, parseDetail } from '../src/scraper/detail';
import { DisallowedError, Fetcher, RateLimitedError, ServerError, USER_AGENT } from '../src/scraper/http';
import { parseList, parseSitemap } from '../src/scraper/list';
import { isAllowed, parseDisallow } from '../src/scraper/robots';
import { reparse, scrape } from '../src/scraper/scrape';

const fx = (name: string): string => readFileSync(join(__dirname, 'fixtures/html', name), 'utf8');

describe('parseList', () => {
  it('記事ID/タイトル/カテゴリ/公開日/追記を取得し次ページを返す', () => {
    const p = parseList(fx('list-1.html'));
    expect(p.items.map((i) => i.id)).toEqual(['20261022_3', '20261022_4', '20261021_1']);
    expect(p.items[0]).toEqual({
      id: '20261022_3',
      url: 'https://www.monster-strike.com/news/20261022_3.html',
      title: 'テストイベントが10/27より開催',
      categories: ['event'],
      published: '2026-10-22',
      addendum: true,
    });
    expect(p.items[1]?.addendum).toBe(false);
    expect(p.next).toBe('/news/index_2.html');
  });
  it('最終ページは next=null（「前へ」は拾わない）', () => {
    expect(parseList(fx('list-2.html')).next).toBeNull();
  });
});

describe('parseSitemap', () => {
  it('id と lastmod を取得', () => {
    expect(parseSitemap(fx('sitemap-news.xml'))).toEqual([
      { id: '20261022_3', url: 'https://www.monster-strike.com/news/20261022_3.html', lastmod: '2026-10-22T08:07:48Z' },
      { id: '20261022_4', url: 'https://www.monster-strike.com/news/20261022_4.html', lastmod: '2026-10-22T08:16:10Z' },
    ]);
  });
});

describe('parseDetail / htmlToLines', () => {
  it('見出しは `# `、brで改行、画像と共有欄は除外、表の行は連結', () => {
    const d = parseDetail('20261022_3', fx('detail-20261022_3.html'));
    expect(d?.title).toBe('テストイベントが10/27より開催');
    expect(d?.published).toBe('2026-10-22');
    expect(d?.lines).toEqual([
      '導入文',
      '▼出現期間',
      '2026年10月27日（火）12:00～11月21日（土）11:59',
      '# 別企画',
      '▼開催期間',
      '2026年10月27日（火）12:00〜11月23日（月）11:59',
      '報酬の受取期限は11月24日（火）3:59までです。',
      '日時 10/28 12:00 〜11:59',
    ]);
  });
  it('見出し内の <a id> を正規化した見出し名で引けるアンカーにする', () => {
    const html = '<div class="news-detail__body"><h2><a id="a"></a>見出しＡ</h2><h3>アンカー無し</h3><h3><a id="4"></a>見出しＢ</h3></div><time class="x" datetime="2026-10-22"></time>';
    const d = parseDetail('x', `<div class="news-detail">${html}</div>`);
    // アンカーの無いh3は直前のh2のアンカーを使う
    expect(d?.anchors).toEqual({ '見出しA': 'a', 'アンカー無し': 'a', '見出しB': '4' });
  });
  it('h2より前のアンカー無しh3は引けない', () => {
    const html = '<div class="news-detail__body"><h3>前置き</h3><h2><a id="1"></a>A</h2></div><time class="x" datetime="2026-10-22"></time>';
    expect(parseDetail('x', `<div class="news-detail">${html}</div>`)?.anchors).toEqual({ A: '1' });
  });
  it('本文が無いページは null', () => {
    expect(parseDetail('x', '<html><body>404</body></html>')).toBeNull();
  });
  it('htmlToLines: インライン要素は連結される', () => {
    expect(htmlToLines('<p>a<span>b</span>c</p>')).toEqual(['abc']);
  });
});

describe('robots', () => {
  it('User-agent: * の Disallow を前方一致で判定', () => {
    const rules = parseDisallow(fx('robots.txt'));
    expect(rules).toEqual(['/mt/admin/', '/mt-static/']);
    expect(isAllowed('/news/20261022_3.html', rules)).toBe(true);
    expect(isAllowed('/mt/admin/x', rules)).toBe(false);
  });
  it('連続する User-agent 行は同一グループ', () => {
    expect(parseDisallow('User-agent: *\nUser-agent: bar\nDisallow: /private/')).toEqual(['/private/']);
  });
  it('他UAの規則は無視', () => {
    expect(parseDisallow('User-agent: Foo\nDisallow: /a/\nUser-agent: *\nDisallow: /b/')).toEqual(['/b/']);
  });
});

function fakeFetcher(responses: Array<Response | Error>, opts: ConstructorParameters<typeof Fetcher>[0] = {}) {
  const calls: Array<{ url: string; at: number; ua: string }> = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const queue = [...responses];
  const fetcher = new Fetcher({
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetchFn: (async (url: string, init?: RequestInit) => {
      calls.push({ url, at: clock, ua: String((init?.headers as Record<string, string>)['User-Agent']) });
      const r = queue.shift();
      if (!r) throw new Error('no response queued');
      if (r instanceof Error) throw r;
      return r;
    }) as typeof fetch,
    ...opts,
  });
  return { fetcher, calls, sleeps };
}
const ok = (body = 'x') => new Response(body, { status: 200 });
const st = (status: number, headers?: Record<string, string>) => new Response('', { status, headers });

describe('Fetcher 礼節', () => {
  it('UA明記・2秒以上の間隔', async () => {
    const { fetcher, calls } = fakeFetcher([ok(), ok(), ok()]);
    await fetcher.get('https://e.test/a');
    await fetcher.get('https://e.test/b');
    await fetcher.get('https://e.test/c');
    expect(calls.map((c) => c.ua)).toEqual([USER_AGENT, USER_AGENT, USER_AGENT]);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(2000);
    expect(calls[2]!.at - calls[1]!.at).toBeGreaterThanOrEqual(2000);
  });
  it('UAに個人メールを含めない', () => {
    expect(USER_AGENT).not.toMatch(/@/);
  });
  it('404 は not_found を返し継続可能', async () => {
    const { fetcher } = fakeFetcher([st(404)]);
    expect(await fetcher.get('https://e.test/a')).toEqual({ status: 'not_found' });
  });
  it('429 は即中断（再試行しない）し Retry-After を保持', async () => {
    const { fetcher, calls } = fakeFetcher([st(429, { 'Retry-After': '120' }), ok()]);
    const err = await fetcher.get('https://e.test/a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfter).toBe('120');
    expect(calls).toHaveLength(1);
  });
  it('5xx は指数バックオフで最大3回リトライし、成功すれば返す', async () => {
    const { fetcher, calls, sleeps } = fakeFetcher([st(503), st(500), st(502), ok('done')]);
    expect(await fetcher.get('https://e.test/a')).toEqual({ status: 'ok', body: 'done' });
    expect(calls).toHaveLength(4);
    expect(sleeps.filter((s) => s >= 2000)).toEqual([2000, 4000, 8000]);
  });
  it('5xx が続けば3回リトライ後に中断', async () => {
    const { fetcher, calls } = fakeFetcher([st(500), st(500), st(500), st(500), ok()]);
    await expect(fetcher.get('https://e.test/a')).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(4);
  });
  it('ネットワーク障害は5xx扱いでリトライ', async () => {
    const { fetcher } = fakeFetcher([new Error('ECONNRESET'), ok('r')]);
    expect(await fetcher.get('https://e.test/a')).toEqual({ status: 'ok', body: 'r' });
  });
  it('リダイレクトは追従しない', async () => {
    const { fetcher, calls } = fakeFetcher([st(301, { Location: 'https://other.test/' }), ok()]);
    await expect(fetcher.get('https://e.test/a')).rejects.toThrow('HTTP 301');
    expect(calls).toHaveLength(1);
  });
  it('robots Disallow のパスは取得しない', async () => {
    const { fetcher, calls } = fakeFetcher([ok()], { disallow: ['/mt/admin/'] });
    await expect(fetcher.get('https://e.test/mt/admin/x')).rejects.toBeInstanceOf(DisallowedError);
    expect(calls).toHaveLength(0);
  });
});

describe('scrape / reparse（オフライン結合）', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'raw-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const site: Record<string, string> = {
    '/robots.txt': fx('robots.txt'),
    '/sitemap-news.xml': fx('sitemap-news.xml'),
    '/news/': fx('list-1.html'),
    '/news/index_2.html': fx('list-2.html'),
    '/news/20261022_3.html': fx('detail-20261022_3.html'),
    '/news/20261022_4.html': fx('detail-20261022_3.html'),
    '/news/20261020_1.html': fx('detail-20261022_3.html'),
  };
  const make = (served: Record<string, string>) => {
    const requested: string[] = [];
    const fetcher = new Fetcher({
      intervalMs: 0,
      sleep: async () => {},
      fetchFn: (async (url: string) => {
        const p = new URL(url).pathname;
        requested.push(p);
        const body = served[p];
        return body === undefined ? st(404) : ok(body);
      }) as typeof fetch,
    });
    return { fetcher, requested };
  };

  it('一覧を巡回して詳細をキャッシュし、再実行では取得済みをスキップ', async () => {
    const cache = new RawCache(dir);
    const a = make(site);
    const r1 = await scrape({ fetcher: a.fetcher, cache, pages: 2 });
    expect(r1.items.map((i) => i.id)).toEqual(['20261022_3', '20261022_4', '20261021_1', '20261020_1']);
    expect(r1.fetched).toEqual(['20261022_3', '20261022_4', '20261020_1']);
    expect(r1.notFound).toEqual(['20261021_1']);
    expect(await cache.read('articles/20261022_3.html')).toContain('news-detail__body');

    const b = make(site);
    const r2 = await scrape({ fetcher: b.fetcher, cache, pages: 2 });
    expect(r2.fetched).toEqual([]);
    expect(r2.skipped).toEqual(['20261022_3', '20261022_4', '20261020_1']);
    expect(b.requested.some((p) => p.endsWith('20261022_3.html'))).toBe(false);
  });

  it('sitemap の lastmod がキャッシュより新しい記事は再取得', async () => {
    const cache = new RawCache(dir);
    await scrape({ fetcher: make(site).fetcher, cache, pages: 1 });
    const old = new Date('2026-10-22T08:10:00Z'); // 20261022_3(08:07)より後、20261022_4(08:16)より前
    await utimes(join(dir, 'articles/20261022_3.html'), old, old);
    await utimes(join(dir, 'articles/20261022_4.html'), old, old);
    const r = await scrape({ fetcher: make(site).fetcher, cache, pages: 1 });
    expect(r.fetched).toEqual(['20261022_4']);
  });

  it('robots で禁止された詳細は飛ばして残りを続行', async () => {
    const cache = new RawCache(dir);
    const m = make({ ...site, '/robots.txt': 'User-agent: *\nDisallow: /news/20261022_3' });
    const r = await scrape({ fetcher: m.fetcher, cache, pages: 1 });
    expect(r.fetched).toEqual(['20261022_4']);
  });

  it('pages=1 なら2ページ目は取得しない', async () => {
    const m = make(site);
    await scrape({ fetcher: m.fetcher, cache: new RawCache(dir), pages: 1 });
    expect(m.requested).not.toContain('/news/index_2.html');
  });

  it('reparse は再取得なしでキャッシュから解析する', async () => {
    const cache = new RawCache(dir);
    await scrape({ fetcher: make(site).fetcher, cache, pages: 1 });
    const rows = await reparse(cache);
    const row = rows.find((r) => r.id === '20261022_3');
    expect(row?.parse_status).toBe('ok');
    expect(row?.events).toBe(2);
  });
});

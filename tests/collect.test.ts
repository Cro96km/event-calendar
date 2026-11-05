import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../src/data/collect';
import { buildExport } from '../src/data/export';
import { buildRecord, toJst, type ArticleRecord } from '../src/data/record';
import { RawCache } from '../src/scraper/cache';
import { Fetcher } from '../src/scraper/http';
import { parseList } from '../src/scraper/list';

const fx = (name: string): string => readFileSync(join(__dirname, 'fixtures/html', name), 'utf8');
const ok = (body: string) => new Response(body, { status: 200 });

const rec = (over: Partial<ArticleRecord>): ArticleRecord => ({
  id: '20261022_3', url: 'https://x/1', title: 't', category: 'event', categories: ['event'], published: '2026-10-22',
  fetched_at: '', lastmod: null, content_hash: 'sha256:0', parse_status: 'ok', events: [], reward_until: null, ...over,
});
const ev = (id: string, start: string, end: string | null) => ({ id, name: id, label: '期間', start, end, raw: '' });

describe('toJst', () => {
  it('UTC → +09:00', () => {
    expect(toJst('2026-10-22T08:07:00Z')).toBe('2026-10-22T17:07:00+09:00');
    expect(toJst(Date.parse('2026-12-31T16:00:00Z'))).toBe('2027-01-01T01:00:00+09:00');
  });
});

describe('buildExport 月境界(ゲーム日4:00基準)', () => {
  const months = (events: ReturnType<typeof ev>[]) =>
    buildExport([rec({ events })], 'g').months.map((m) => m.month);

  it('月またぎは両月に含める', () => {
    expect(months([ev('a#0', '2026-10-27T12:00:00+09:00', '2026-11-21T11:59:00+09:00')])).toEqual(['2026-10', '2026-11']);
  });
  it('1日 0:00〜3:59 開始は前月のゲーム日に属する', () => {
    expect(months([ev('a#0', '2026-11-01T01:00:00+09:00', '2026-11-01T11:00:00+09:00')])).toEqual(['2026-10', '2026-11']);
    expect(months([ev('a#0', '2026-11-01T04:00:00+09:00', '2026-11-01T11:00:00+09:00')])).toEqual(['2026-11']);
  });
  it('終了が翌月1日の丁度4:00なら翌月には出さない / 4:01なら出す', () => {
    expect(months([ev('a#0', '2026-10-30T12:00:00+09:00', '2026-11-01T04:00:00+09:00')])).toEqual(['2026-10']);
    expect(months([ev('a#0', '2026-10-30T12:00:00+09:00', '2026-11-01T04:01:00+09:00')])).toEqual(['2026-10', '2026-11']);
  });
  it('終了未定は開始月のみ。年またぎも連続する', () => {
    expect(months([ev('a#0', '2026-10-17T04:00:00+09:00', null)])).toEqual(['2026-10']);
    expect(months([ev('a#0', '2026-12-28T12:00:00+09:00', '2027-02-03T11:59:00+09:00')])).toEqual(['2026-12', '2027-01', '2027-02']);
  });
  it('none は除外し、index にカテゴリと月一覧', () => {
    const e = [ev('a#0', '2026-10-27T12:00:00+09:00', '2026-10-28T11:59:00+09:00')];
    const { months: m, index } = buildExport([rec({ events: e }), rec({ id: 'b', parse_status: 'none', category: 'other', events: e })], 'G');
    expect(m).toHaveLength(1);
    expect(m[0]?.events[0]).toMatchObject({ id: 'a#0', article_id: '20261022_3', category: 'event', reward_until: null });
    expect(index).toEqual({ generated_at: 'G', months: ['2026-10'], categories: ['event'] });
  });
});

describe('buildRecord', () => {
  const item = parseList(fx('list-1.html')).items[0]!;
  const html = fx('detail-20261022_3.html');
  it('スキーマどおりに生成し本文は含めない', () => {
    const r = buildRecord({ item, html, fetchedAtMs: Date.parse('2026-10-23T05:00:00Z'), lastmod: '2026-10-22T08:07:00Z' });
    expect(r).toMatchObject({ id: '20261022_3', category: 'event', fetched_at: '2026-10-23T14:00:00+09:00', lastmod: '2026-10-22T17:07:00+09:00', parse_status: 'ok' });
    expect(r.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain('導入文');
  });
  it('内容が同じなら前回レコードを返す(fetched_atだけの差分を作らない)', () => {
    const a = buildRecord({ item, html, fetchedAtMs: 1_000_000_000_000 });
    expect(buildRecord({ item, html, fetchedAtMs: 1_100_000_000_000, prev: a })).toBe(a);
    expect(buildRecord({ item, html: html + ' ', fetchedAtMs: 1_100_000_000_000, prev: a })).not.toBe(a);
  });
  it('詳細を解釈できなければ none', () => {
    expect(buildRecord({ item, html: '<html></html>', fetchedAtMs: 0 }).parse_status).toBe('none');
  });
});

describe('collect', () => {
  const requested: string[] = [];
  let dir: string;
  beforeEach(async () => {
    requested.length = 0;
    dir = await mkdtemp(join(tmpdir(), 'collect-'));
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
  const run = (served: Record<string, string | number>, extra: { pages?: number; since?: string } = {}) => {
    const fetcher = new Fetcher({
      intervalMs: 0,
      maxRetries: 0,
      sleep: async () => {},
      fetchFn: (async (url: string) => {
        requested.push(new URL(url).pathname);
        const v = served[new URL(url).pathname];
        if (typeof v === 'number') return new Response('', { status: v });
        return v === undefined ? new Response('', { status: 404 }) : ok(v);
      }) as typeof fetch,
    });
    return collect({
      fetcher, cache: new RawCache(join(dir, 'raw')), pages: extra.pages ?? 2, since: extra.since,
      articlesDir: join(dir, 'articles'), publicDir: join(dir, 'public'), runsLog: join(dir, 'runs.log'),
      now: () => new Date('2026-10-23T05:00:00Z'),
    });
  };

  it('正本JSONと月別exportを生成し、再実行で正本に差分を出さない', async () => {
    const s = await run(site);
    expect(s.items).toBe(4);
    expect(s.total).toEqual({ ok: 3, partial: 0, none: 0 });
    expect(s.months).toEqual(['2026-10', '2026-11']);
    const art = JSON.parse(await readFile(join(dir, 'articles/2026/20261022_3.json'), 'utf8')) as ArticleRecord;
    expect(art.id).toBe('20261022_3');
    const idx = JSON.parse(await readFile(join(dir, 'public/index.json'), 'utf8')) as { generated_at: string; categories: string[] };
    expect(idx.generated_at).toBe('2026-10-23T14:00:00+09:00');
    expect(await readdir(join(dir, 'public/events'))).toEqual(['2026-10.json', '2026-11.json']);

    const before = await readFile(join(dir, 'articles/2026/20261022_3.json'), 'utf8');
    const s2 = await run(site);
    expect(s2.written).toBe(0);
    expect(await readFile(join(dir, 'articles/2026/20261022_3.json'), 'utf8')).toBe(before);
    const log = (await readFile(join(dir, 'runs.log'), 'utf8')).trim().split('\n');
    expect(log).toHaveLength(2);
    expect(JSON.parse(log[0]!)).toMatchObject({ items: 4, aborted: null, notFound: ['20261021_1'] });
  });

  it('429で中断しても取得済み分を保存しrunsに記録、終了は中断として返す', async () => {
    const s = await run({ ...site, '/news/20261022_4.html': 429 });
    expect(s.aborted).toMatch(/^RateLimitedError/);
    expect(s.written).toBe(1);
    expect(await readdir(join(dir, 'articles/2026'))).toEqual(['20261022_3.json']);
    expect(JSON.parse((await readFile(join(dir, 'runs.log'), 'utf8')).trim()).aborted).toMatch(/RateLimited/);
  });

  it('--since: 公開日が since 以上の記事だけ対象にし、古いページで巡回を止める', async () => {
    const s = await run(site, { pages: 10, since: '2026-10-22' });
    expect(s.items).toBe(2);
    expect(requested).not.toContain('/news/index_2.html');
  });

  it('5xxや想定外エラー(3xx)でも取得済み分を保存して中断として返す', async () => {
    const s5 = await run({ ...site, '/news/20261022_4.html': 500 });
    expect(s5.aborted).toMatch(/^ServerError/);
    expect(s5.written).toBe(1);
    const s3 = await run({ ...site, '/news/20261022_4.html': 302 });
    expect(s3.aborted).toMatch(/HTTP 302/);
    expect((await readFile(join(dir, 'runs.log'), 'utf8')).trim().split('\n')).toHaveLength(2);
  });

  it('正本が0件のときは既存のexportを消さない', async () => {
    await run(site);
    const { writeExport } = await import('../src/data/store');
    await writeExport(join(dir, 'public'), [], 'g');
    expect(await readdir(join(dir, 'public/events'))).toEqual(['2026-10.json', '2026-11.json']);
  });
});

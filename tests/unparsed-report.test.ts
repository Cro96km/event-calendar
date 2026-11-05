import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '../src/data/record';
import { buildUnparsedReport, classifyUnparsed, formatUnparsedReport } from '../src/unparsed-report';

const rec = (id: string, title: string, category: string, parse_status: ArticleRecord['parse_status'] = 'none', published = '2026-10-01T12:00:00+09:00'): ArticleRecord => ({
  id, url: `https://example.test/${id}`, title, category, categories: [category], published, fetched_at: published, lastmod: null, content_hash: 'x', parse_status, events: [], reward_until: null,
});

describe('classifyUnparsed', () => {
  it.each([
    ['「前田慶次」の獣神化・改が11/11に解禁！', 'update', 'evolution'],
    ['Ver.31.1アップデート情報を公開！', 'update', 'maintenance'],
    ['メンテナンスの実施について', 'maintenance', 'maintenance'],
    ['Ver.31.2アップデート後に確認されている不具合', 'error', 'notice'],
    ['重要なお知らせ', 'important', 'notice'],
    ['Ver.31/2の情報 11/20よりガチャ開催', 'event', 'title-date-event'],
    ['「A」の獣神化が登場', 'update', 'undated-other'],
    ['「新機能」が11/1より開催', 'update', 'dated-other'],
    ['不具合について', 'error', 'notice'],
    ['ガチャ「モンストジェネレーション」11/20より開催！', 'event', 'title-date-event'],
    ['「新機能」を11/1に公開', 'update', 'dated-other'],
    ['お知らせ', 'other', 'undated-other'],
  ])('%s', (title, category, expected) => expect(classifyUnparsed({ title, category })).toBe(expected));
});

describe('buildUnparsedReport', () => {
  const records = [
    rec('1', 'ガチャ「A」11/20より開催！', 'event', 'none', '2026-10-01T00:00:00+09:00'),
    rec('2', 'ガチャ「B」11/21より開催！', 'event', 'none', '2026-10-02T00:00:00+09:00'),
    rec('3', 'お知らせ', 'other'),
    rec('4', 'ok記事 11/1より開催', 'event', 'ok'),
  ];
  it('none だけを数え、件数順・公開日の新しい順で返す', () => {
    const r = buildUnparsedReport(records, 1);
    expect(r.map((g) => [g.group, g.count])).toEqual([['title-date-event', 2], ['undated-other', 1]]);
    expect(r[0]?.examples.map((e) => e.id)).toEqual(['2']);
  });
  it('整形に件数・提案・例が含まれ、提案と例を出す', () => {
    const text = formatUnparsedReport(buildUnparsedReport(records), records.length);
    expect(text).toContain('期間不明(none): 3件 / 全4件');
    expect(text).toContain('提案:');
    expect(text).toContain('ガチャ「B」');
  });
});

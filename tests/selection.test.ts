import { describe, expect, it } from 'vitest';
import type { ExportEvent } from '../src/data/export';
import type { ArticleRecord } from '../src/data/record';
import { parseArticle } from '../src/period';
import { applySelection, buildCandidates, itemKey, normalizeTitle } from '../src/selection';

const rec = (id: string, title: string, over: Partial<ArticleRecord> = {}): ArticleRecord => ({
  id, url: `https://x/${id}`, title, category: 'event', categories: ['event'], published: '2026-10-22',
  fetched_at: '', lastmod: null, content_hash: 'h', parse_status: 'ok', reward_until: null,
  events: [{ id: `${id}#0`, name: 'n', title_named: true, label: '期間', start: `2026-10-${id.slice(0, 2)}T12:00:00+09:00`, end: `2026-10-${id.slice(0, 2)}T23:59:00+09:00`, raw: '' }],
  ...over,
});

describe('normalizeTitle', () => {
  it('日付・時刻・回数を落として同種を集約する', () => {
    expect(normalizeTitle('ガチャ「RED STARS」10/23より開催！')).toBe(normalizeTitle('ガチャ「RED STARS」11/5より開催！'));
    expect(normalizeTitle('「絶級トーナメント」が10/26 12時より期間限定で登場！')).toBe('「絶級トーナメント」が期間限定で登場！');
    expect(normalizeTitle('ガチャ「激・獣神祭」開催！第1～3弾の初回')).toBe('ガチャ「激・獣神祭」開催！第N弾の初回');
    expect(normalizeTitle('第2回 大会 3回目')).toBe('第N回 大会 N回目');
  });
  it('別物は区別し、区切り文字 | は全角にする', () => {
    expect(normalizeTitle('ガチャ「A」')).not.toBe(normalizeTitle('ガチャ「B」'));
    expect(normalizeTitle('a | b')).toBe('a ｜ b');
  });
});

describe('buildCandidates', () => {
  const recs = [
    rec('01_1', 'ガチャ「X」10/1より開催！'),
    rec('15_1', 'ガチャ「X」10/15より開催！'),
    rec('05_1', '別イベント'),
    rec('06_1', '除外', { category: 'update' }),
    rec('07_1', '期間なし', { parse_status: 'none', events: [] }),
  ];
  it('集約・件数・直近期間・除外カテゴリと期間なしは候補外', () => {
    const c = buildCandidates(recs);
    expect(c.map((x) => x.key).sort()).toEqual(['ガチャ「X」開催！', '別イベント'].sort());
    const x = c.find((k) => k.key === 'ガチャ「X」開催！');
    expect(x).toMatchObject({ count: 2, latest: '2026-10-15〜2026-10-15', url: 'https://x/15_1', category: 'event' });
    expect(c).toHaveLength(2);
  });
});

describe('表示への反映', () => {
  const ev = (id: string, title: string): ExportEvent => ({ item: normalizeTitle(title), id, article_id: id, name: title, title, category: 'event', start: '2026-10-27T12:00:00+09:00', end: '2026-10-28T11:59:00+09:00', reward_until: null, url: 'u' });
  const events = [ev('a#0', 'ガチャ「X」10/1より開催！'), ev('b#0', '別')];
  it('選択済みのみ。選択情報なしなら全件', () => {
    expect(applySelection(events, null)).toHaveLength(2);
    expect(applySelection([...events, { ...(events[0] as ExportEvent), id: 'm#0', category: 'maintenance', item: 'メンテ' }], { generated_at: '', selected: [], total: 0 }).map((e) => e.id)).toEqual(['m#0']); // メンテナンスは選択に依らず表示
    expect(applySelection(events, { generated_at: '', selected: ['ガチャ「X」開催！'], total: 2 }).map((e) => e.id)).toEqual(['a#0']);
    expect(applySelection(events, { generated_at: '', selected: [], total: 2 })).toHaveLength(0);
  });
});

// ---- 記事内の項目単位の候補(spec §4.5)。本文は含まない合成データ ----
const SYN = ['# 項目A!', '▼開催期間', '2026年10月10日(土)12:00〜10月13日(火)11:59', '# 項目B!(追記:10/12)', '# 項目C!', '▼対象期間', '2026年10月10日(土)0:00〜10月12日(月)23:59'];
const synRec = (id: string, title: string, lines: string[], category = 'event'): ArticleRecord => {
  const p = parseArticle({ id, title, published: '2026-10-09', lines });
  return { id, url: `https://x/${id}`, title, category, categories: [category], published: '2026-10-09', fetched_at: '', lastmod: null, content_hash: 'h', parse_status: p.parse_status, events: p.events, reward_until: p.reward_until };
};

describe('項目単位の候補', () => {
  const r = synRec('A_1', '記事タイトル10/10より開催！', SYN);
  it('1記事が見出し単位の候補に分かれ、期間の無い告知項目は記事期間を継承(印付き)', () => {
    const c = buildCandidates([r]);
    expect(c.map((x) => x.key).sort()).toEqual(['項目A!', '項目B!', '項目C!']);
    expect(c.find((x) => x.key === '項目A!')).toMatchObject({ inherited: false, latest: '2026-10-10〜2026-10-13' });
    expect(c.find((x) => x.key === '項目B!')).toMatchObject({ inherited: true, latest: '2026-10-10〜2026-10-13' });
    expect(c.find((x) => x.key === '項目C!')).toMatchObject({ inherited: false, latest: '2026-10-10〜2026-10-12' });
  });
  it('項目キーは追記注記を含まず、見出し無しはタイトル由来', () => {
    expect(itemKey('t', { name: '項目B!(追記:10/12)' })).toBe('項目B!');
    expect(itemKey('ガチャ10/1より', { name: '何か #1', title_named: true })).toBe('ガチャ');
  });
  it('項目単位で選択すると他の項目はカレンダーに出ない', () => {
    const evs: ExportEvent[] = r.events.map((e) => ({ id: e.id, article_id: 'A_1', name: e.name, title: r.title, category: 'event', start: e.start, end: e.end, reward_until: null, url: 'u', item: itemKey(r.title, e) }));
    expect(applySelection(evs, { generated_at: '', selected: ['項目C!'], total: 3 }).map((e) => e.name)).toEqual(['項目C!']);
  });
  it('最初の期間見出しが告知らしくない記事はタイトル項目になり、期間付き日時(配信等)は継承しない', () => {
    const t = synRec('B_1', '記事Bタイトル', ['# 遊び方', '▼開催期間', '2026年10月10日(土)12:00〜10月13日(火)11:59', '# 生配信を実施!', '▼配信日時', '2026年10月11日(日)19:00頃〜']);
    expect(t.events).toHaveLength(1);
    expect(buildCandidates([t]).map((x) => x.key)).toEqual(['記事Bタイトル']);
  });
});


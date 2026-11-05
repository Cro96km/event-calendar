import { describe, expect, it } from 'vitest';
import type { ExportEvent, IndexFile, MonthFile } from '../src/data/export';
import { buildPublic, publicCutoff, publicLimit } from '../src/data/public-export';
import type { SelectionJson } from '../src/selection';

const NOW = Date.parse('2026-11-05T12:00:00+09:00');
const ev = (id: string, item: string, start: string, end: string | null, category = 'event'): ExportEvent => ({
  id, article_id: id, name: item, title: item, category, start, end, reward_until: null, url: `https://x/${id}`, item,
});
const month = (m: string, events: ExportEvent[]): MonthFile => ({ month: m, events });
const index = (months: string[]): IndexFile => ({ generated_at: '2026-11-05T12:00:00+09:00', months, categories: [] });
const sel = (selected: string[]): SelectionJson => ({ generated_at: '', selected, total: selected.length });

describe('publicCutoff', () => {
  it('JSTの今日から12ヶ月前', () => {
    expect(publicCutoff(NOW)).toBe('2025-11-05');
    // UTCではまだ前日でもJSTの日付で数える
    expect(publicCutoff(Date.parse('2026-11-05T00:30:00+09:00'))).toBe('2025-11-05');
  });
});

describe('publicLimit と未来の限界', () => {
  it('JSTの今日から12ヶ月後。それより後に始まる項目は公開しない', () => {
    expect(publicLimit(NOW)).toBe('2027-11-05');
    const near = ev('n', 'N', '2027-11-05T12:00:00+09:00', '2027-11-07T12:00:00+09:00');
    const far = ev('f', 'F', '2027-11-06T00:00:00+09:00', '2027-11-08T12:00:00+09:00');
    const out = buildPublic([month('2027-11', [near, far])], index(['2027-11']), sel(['N', 'F']), NOW);
    expect(out.months.flatMap((m) => m.events.map((e) => e.id))).toEqual(['n']);
    expect(buildPublic([month('2027-12', [ev('g', 'G', '2027-12-01T12:00:00+09:00', null)])], index(['2027-12']), sel(['G']), NOW).months).toEqual([]);
  });
});

describe('buildPublic', () => {
  const old = ev('a', 'A', '2025-09-01T12:00:00+09:00', '2025-09-10T12:00:00+09:00');
  const edge = ev('b', 'B', '2025-10-30T12:00:00+09:00', '2025-11-10T12:00:00+09:00'); // cutoffをまたぐ
  const recent = ev('c', 'C', '2026-10-30T12:00:00+09:00', '2026-11-10T12:00:00+09:00');
  const hidden = ev('d', 'D', '2026-10-30T12:00:00+09:00', '2026-11-10T12:00:00+09:00');
  const open = ev('e', 'E', '2026-11-01T12:00:00+09:00', null);
  const months = [month('2025-09', [old]), month('2025-10', [edge]), month('2025-11', [edge]), month('2026-10', [recent, hidden]), month('2026-11', [recent, hidden, open])];
  const all = sel(['A', 'B', 'C', 'E']);

  it('非表示の項目と12ヶ月より前に終わった項目を除く', () => {
    const r = buildPublic(months, index(months.map((m) => m.month)), all, NOW);
    const ids = r.months.flatMap((m) => m.events.map((e) => e.id));
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('d');
    expect(ids).toEqual(expect.arrayContaining(['b', 'c', 'e']));
  });
  it('cutoffの月より前の月ファイルは出さず、indexを作り直す', () => {
    const r = buildPublic(months, index(months.map((m) => m.month)), all, NOW);
    expect(r.months.map((m) => m.month)).toEqual(['2025-11', '2026-10', '2026-11']);
    expect(r.index.months).toEqual(['2025-11', '2026-10', '2026-11']);
    expect(r.index.categories).toEqual(['event']);
    expect(r.index.generated_at).toBe('2026-11-05T12:00:00+09:00');
  });
  it('メンテナンスは選択に関わらず残る', () => {
    const m = ev('m', 'メンテ', '2026-11-02T12:00:00+09:00', '2026-11-02T15:00:00+09:00', 'maintenance');
    const r = buildPublic([month('2026-11', [m])], index(['2026-11']), sel([]), NOW);
    expect(r.months[0]?.events.map((e) => e.id)).toEqual(['m']);
  });
  it('選択情報が無いときは投げる(未判断の項目を公開しない)', () => {
    expect(() => buildPublic(months, index([]), null, NOW)).toThrow('selection.json');
  });
  it('入力を変更しない', () => {
    const before = JSON.stringify(months);
    buildPublic(months, index([]), all, NOW);
    expect(JSON.stringify(months)).toBe(before);
  });
});

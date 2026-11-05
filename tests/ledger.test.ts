import { describe, expect, it } from 'vitest';
import type { ExportEvent } from '../src/data/export';
import { ledgerRows, renderLedger, LEDGER_MARK } from '../src/ledger';

const ev = (id: string, name: string, start: string, end: string | null, extra: Partial<ExportEvent> = {}): ExportEvent => ({
  id, article_id: id.split('#')[0] as string, name, title: name, category: 'event', start, end, reward_until: null, url: `https://example.test/${id}`, ...extra,
});
const events = [
  ev('a#0', '覇者の塔', '2026-11-03T12:00:00+09:00', '2026-11-20T11:59:00+09:00', { details: [{ label: '対象ステージ', lines: ['・A', '・B', '・C', '・D'] }] }),
  ev('b#0', '超究極クエスト（イザナミ）が登場', '2026-11-05T19:00:00+09:00', '2026-12-01T11:59:00+09:00'),
  ev('m#0', 'メンテナンス', '2026-11-10T02:00:00+09:00', '2026-11-10T05:00:00+09:00', { category: 'maintenance' }),
  ev('old#0', '終わった項目', '2026-09-01T00:00:00+09:00', '2026-09-02T00:00:00+09:00'),
];

describe('台帳', () => {
  const rows = ledgerRows(events, '2026-11');
  it('その月に掛かる項目だけを、画面と同じ順(定例→超究極→メンテナンス)で出す', () => {
    const named = rows.filter((r) => r.source === '公式').map((r) => r.id);
    expect(named).toEqual(['a#0', 'b#0', 'm#0']);
    expect(rows.map((r) => r.id)).not.toContain('old#0');
    expect(rows.find((r) => r.id === 'm#0')?.section).toBe('メンテナンス');
  });
  it('小見出し・項目ID・内容(先頭3件+他N件)を持つ', () => {
    const a = rows.find((r) => r.id === 'a#0');
    expect(a).toMatchObject({ section: 'クエスト', group: '定例クエスト', source: '公式' });
    expect(a?.content).toBe('対象ステージ: ・A / ・B / ・C 他1件');
  });
  it('毎月決まった日の項目は1行にまとめ、定例日程として出す', () => {
    const m = rows.filter((r) => r.source === '定例日程');
    expect(m.length).toBeGreaterThan(0);
    expect(m[0]?.id.startsWith('monthly:')).toBe(true);
    expect(m[0]?.content).toMatch(/^毎月 /);
  });
  it('Markdown: 年付きの期間(JST)と生成印、表示範囲の月だけ', () => {
    const files = renderLedger(events, '2026-11-05');
    const text = files.get('2026-11') as string;
    expect(text.startsWith(LEDGER_MARK)).toBe(true);
    expect(text).toContain('2026-11-03 12:00〜2026-11-20 11:59');
    expect(text).toContain('`a#0`');
    expect(files.has('2020-01')).toBe(false);
  });
});

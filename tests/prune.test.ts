import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '../src/data/record';
import { lastDay, pruneTargets } from '../src/prune';

const rec = (id: string, published: string, ends: (string | null)[] = []): ArticleRecord =>
  ({ id, published, events: ends.map((end, i) => ({ id: `${id}#${i}`, start: `${published}T12:00:00+09:00`, end })) }) as unknown as ArticleRecord;

describe('不要データの削除の対象(npm run prune)', () => {
  it('lastDay: 最も遅い終了(未定は開始)。項目が無ければ公開日', () => {
    expect(lastDay(rec('a', '2025-01-01', ['2025-01-05T11:59:00+09:00', '2025-02-01T11:59:00+09:00']))).toBe('2025-02-01');
    expect(lastDay(rec('b', '2025-03-01', [null]))).toBe('2025-03-01');
    expect(lastDay(rec('c', '2025-04-01'))).toBe('2025-04-01');
  });
  it('基準の日より前に終わったものだけ。範囲の中まで続く記事は残す', () => {
    const all = [
      rec('old', '2025-01-01', ['2025-01-05T11:59:00+09:00']),
      rec('none', '2025-02-01'),
      rec('cross', '2025-10-30', ['2025-11-10T11:59:00+09:00']),
      rec('recent', '2026-10-30', ['2026-11-10T11:59:00+09:00']),
    ];
    expect(pruneTargets(all, '2025-11-05').map((r) => r.id)).toEqual(['old', 'none']);
    expect(pruneTargets(all, '2025-01-01')).toEqual([]);
  });
});

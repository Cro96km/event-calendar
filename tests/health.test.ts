import { describe, expect, it } from 'vitest';
import cfg from '../config/judge/health.json';
import { DEFAULT_LIMITS, judgeHealth, type HealthInput } from '../src/health';

const base: HealthInput = { collect: { aborted: null }, prevArticles: 100, curArticles: 105, newArticles: 5, changedArticles: 2, unparsedNew: 1, configProblems: [] };
const L = { maxChangedArticles: 10, maxChangedRatio: 0.2, minNewArticles: 4, maxUnparsedRatio: 0.5 };

describe('judgeHealth(自動マージの健全性)', () => {
  it('問題なし: ok で理由は空', () => {
    expect(judgeHealth(base, L)).toEqual({ ok: true, reasons: [] });
  });
  it('収集しなかった(設定だけの反映)でも問題なければ ok', () => {
    expect(judgeHealth({ ...base, collect: null, newArticles: 0, curArticles: 100, changedArticles: 0, unparsedNew: 0 }, L).ok).toBe(true);
  });
  it('収集が中断したら要確認(理由に中断の内容)', () => {
    const h = judgeHealth({ ...base, collect: { aborted: 'RateLimitedError: 429' } }, L);
    expect(h.ok).toBe(false);
    expect(h.reasons[0]).toContain('RateLimitedError: 429');
  });
  it('記事が減ったら要確認', () => {
    expect(judgeHealth({ ...base, curArticles: 99 }, L).reasons[0]).toContain('記事が減っています');
  });
  it('既存の記事の書き換え: 上限は maxChangedArticles と 件数×比率 の大きい方。境界は許す', () => {
    // 100件×0.2=20 > 10 → 上限20
    expect(judgeHealth({ ...base, changedArticles: 20 }, L).ok).toBe(true);
    expect(judgeHealth({ ...base, changedArticles: 21 }, L).reasons[0]).toContain('上限20件');
    // 少ない記事数では maxChangedArticles(10)が上限
    expect(judgeHealth({ ...base, prevArticles: 20, curArticles: 22, changedArticles: 10 }, L).ok).toBe(true);
    expect(judgeHealth({ ...base, prevArticles: 20, curArticles: 22, changedArticles: 11 }, L).reasons[0]).toContain('上限10件');
  });
  it('期間が取れない新規: 新規が minNewArticles 未満なら割合を見ない。以上なら割合が上限を超えたら要確認(境界は許す)', () => {
    expect(judgeHealth({ ...base, newArticles: 3, unparsedNew: 3 }, L).ok).toBe(true);
    expect(judgeHealth({ ...base, newArticles: 4, unparsedNew: 2 }, L).ok).toBe(true); // 0.5 は許す
    expect(judgeHealth({ ...base, newArticles: 4, unparsedNew: 3 }, L).reasons[0]).toContain('3/4件');
  });
  it('設定の矛盾は要確認。複数の理由を全部返す', () => {
    const h = judgeHealth({ ...base, collect: { aborted: 'x' }, configProblems: ['A', 'B'] }, L);
    expect(h.ok).toBe(false);
    expect(h.reasons).toEqual(['収集が最後まで終わっていません(x)', '設定の矛盾: A', '設定の矛盾: B']);
  });
  it('既定の閾値は config/judge/health.json', () => {
    expect(DEFAULT_LIMITS).toMatchObject({ maxChangedArticles: cfg.maxChangedArticles, maxChangedRatio: cfg.maxChangedRatio });
    expect(judgeHealth(base).ok).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { ExportEvent } from '../src/data/export';
import { barEdgeColors } from '../src/newlimited';
import { regularGachaColor, withRegularGachaColors } from '../src/gacha-color';
import { orderProblems } from '../src/order-check';
import order from '../config/display/order.json';

const ev = (name: string, extra: Partial<ExportEvent> = {}): ExportEvent => ({ id: `g#${name}`, article_id: 'g', name, title: name, category: 'event', start: '2026-11-07T12:00:00+09:00', end: '2026-11-10T11:59:00+09:00', reward_until: null, url: '', ...extra });

describe('定例ガチャの属性色(order.json の attrs)', () => {
  it('RED STARS=火・水の遊宴=水・グリーンファンタジー=木・STARLIGHT MIRAGE=光・ミッドナイト・パーティー=闇の色', () => {
    expect(regularGachaColor(ev('ガチャ「RED STARS」'))).toBe('#eb0043');
    expect(regularGachaColor(ev('ガチャ「水の遊宴」'))).toBe('#3154ef');
    expect(regularGachaColor(ev('ガチャ「グリーンファンタジー」'))).toBe('#007d32');
    expect(regularGachaColor(ev('ガチャ「STARLIGHT MIRAGE」'))).toBe('#a16800');
    expect(regularGachaColor(ev('ガチャ「ミッドナイト・パーティー」'))).toBe('#a237c3');
  });
  it('語が無い定例ガチャ・定例でないガチャ・キャラクターの項目は色なし', () => {
    expect(regularGachaColor(ev('ガチャ「彩・獣神祭」'))).toBeUndefined();
    expect(regularGachaColor(ev('ガチャ「ほかのコラボ」', { category: 'collab' }))).toBeUndefined();
    expect(regularGachaColor(ev('RED STARS', { character: { kind: '真獣神化' } }))).toBeUndefined();
  });
  it('color(ラベル)と edge_color(バーの縁)を付ける。すでに color がある項目は変えない', () => {
    const [a, b] = withRegularGachaColors([ev('ガチャ「RED STARS」'), ev('ガチャ「水の遊宴」', { color: '#123456' })]);
    expect(a).toMatchObject({ color: '#eb0043', edge_color: '#eb0043' });
    expect(b?.color).toBe('#123456');
    expect(b?.edge_color).toBeUndefined();
    expect(barEdgeColors(a as ExportEvent)).toEqual(['#eb0043']);
  });
  it('設定の点検: attrs の語は words にあり、属性は 火・水・木・光・闇', () => {
    const c = structuredClone(order) as typeof order;
    expect(orderProblems(c as never)).toEqual([]);
    const reg = (c.groups.gacha as { name: string; attrs?: Record<string, string> }[]).find((g) => g.name === '定例ガチャ');
    if (!reg) throw new Error('定例ガチャ');
    reg.attrs = { 存在しない語: '火', 'RED STARS': '赤' };
    const p = orderProblems(c as never).join('\n');
    expect(p).toContain('attrs の「存在しない語」は words にありません');
    expect(p).toContain('属性は 火・水・木・光・闇');
  });
});

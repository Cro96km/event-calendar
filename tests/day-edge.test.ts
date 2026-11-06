import { describe, expect, it } from 'vitest';
import { dayAttrColors, dayEdgeSegments, edgeGradient } from '../src/day-edge';

const RED = '#eb0043', BLUE = '#3154ef', GREEN = '#007d32', YELLOW = '#a16800', PURPLE = '#a237c3';
const base = { name: '「追憶の書庫」でスコア報酬に「5倍」のスペシャルボーナス!', start: '2026-10-11T04:00:00+09:00', end: '2026-10-15T03:59:00+09:00' };

describe('日ごとの対象属性の縁(day-edge)', () => {
  it('詳細の `M/D(曜) X属性クエスト` から、日付 → 属性色を作る', () => {
    const m = dayAttrColors({ ...base, details: [{ label: '対象クエスト', lines: ['10/11(日) 水属性クエスト', '10/12(月) 木属性クエスト', '10/13(火) 火属性クエスト', '10/14(水) 光属性クエスト', '10/15(木) 闇属性クエスト'] }] });
    expect([...m]).toEqual([['2026-10-11', [BLUE]], ['2026-10-12', [GREEN]], ['2026-10-13', [RED]], ['2026-10-14', [YELLOW]], ['2026-10-15', [PURPLE]]]);
  });
  it('名前が固定のクエスト(特Lの園の神殿)は結び付けた属性色。年をまたぐ開催は翌年の日付', () => {
    const m = dayAttrColors({ name: '特Lの園', start: '2026-12-30T00:00:00+09:00', end: '2027-01-01T23:59:00+09:00', details: [{ label: '対象クエスト', lines: ['12/30(水) 獄炎の神殿 特Lの園', '12/31(木) 秘泉の神殿 特Lの園', '1/1(金) 樹縛の神殿 特Lの園'] }] });
    expect([...m]).toEqual([['2026-12-30', [RED]], ['2026-12-31', [BLUE]], ['2027-01-01', [GREEN]]]);
  });
  it('ノーマルクエストの経験値アップは、曜日ごとの設定から展開(土=火水木の3色)', () => {
    const m = dayAttrColors({ name: 'ノーマルクエストの経験値が2倍', start: '2026-10-24T04:00:00+09:00', end: '2026-10-26T03:59:00+09:00' });
    expect(m.get('2026-10-24')).toEqual([RED, BLUE, GREEN]);
    expect(m.get('2026-10-25')?.length).toBe(2);
  });
  it('属性の行が無いイベントは空', () => {
    expect(dayAttrColors({ name: 'ガチャ', start: '2026-10-11T00:00:00+09:00', end: null }).size).toBe(0);
  });

  const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  const colors = new Map([['2026-10-11', [BLUE]], ['2026-10-12', [GREEN]], ['2026-10-13', [RED]]]);
  it('バーを日(列)ごとに区切る。開始・終了の時刻の割合を幅に含め、色の無い日は既定の縁(null)', () => {
    const segs = dayEdgeSegments({ from: 1, to: 4, startFrac: 0.5, endFrac: 1 }, days, colors);
    // 幅 = 0.5 + 1 + 1 + 1 = 3.5
    expect(segs?.map((s) => [s.color, +s.a.toFixed(3), +s.b.toFixed(3)])).toEqual([[BLUE, 0, 0.143], [GREEN, 0.143, 0.429], [RED, 0.429, 0.714], [null, 0.714, 1]]);
  });
  it('1日に複数の属性があれば、その日の幅を等分する', () => {
    const segs = dayEdgeSegments({ from: 0, to: 1, startFrac: 0, endFrac: 1 }, days, new Map([['2026-10-10', [RED, BLUE]], ['2026-10-11', [GREEN]]]));
    expect(segs?.map((s) => [s.color, s.a, s.b])).toEqual([[RED, 0, 0.25], [BLUE, 0.25, 0.5], [GREEN, 0.5, 1]]);
  });
  it('色のある日が2日未満なら null(従来の縁)', () => {
    expect(dayEdgeSegments({ from: 1, to: 1, startFrac: 0, endFrac: 1 }, days, colors)).toBeNull();
    expect(dayEdgeSegments({ from: 1, to: 4, startFrac: 0, endFrac: 1 }, days, new Map([['2026-10-11', [BLUE]]]))).toBeNull();
  });
  it('グラデーションの文字列: 属性色は --ep・--ek で縁の濃さに合わせ、色なしは既定の縁', () => {
    const g = edgeGradient([{ color: BLUE, a: 0, b: 0.5 }, { color: null, a: 0.5, b: 1 }]);
    expect(g).toBe('linear-gradient(90deg, color-mix(in srgb, #3154ef var(--ep), var(--ek)) 0.000% 50.000%, var(--c-bar-edge) 50.000% 100.000%)');
  });
});

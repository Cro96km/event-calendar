import { describe, expect, it } from 'vitest';
import type { ExportEvent } from '../src/data/export';
import { addEntry, applyManual, hideEntry, manualEvents, manualProblems, MANUAL, removeEntry, unhideEntry, type ManualConfig } from '../src/manual';
import { sectionOfEvent } from '../src/sections';
import { applySelection } from '../src/selection';
import { campaignGroup, ganttSections, questGroup, weekDays } from '../src/week';

const ev = (id: string, article: string, category = 'event'): ExportEvent => ({
  id,
  article_id: article,
  name: id,
  title: id,
  category,
  start: '2026-11-05T00:00:00+09:00',
  end: '2026-11-05T05:00:00+09:00',
  reward_until: null,
  url: '',
});
const base: ManualConfig = { add: [], hide: [] };
const flash = { name: '閃きの遊技場', category: 'event' as const, start: '2024-01-01 00:00', end: '2026-12-31 23:59', group: '定例クエスト' };

describe('手動の調整: add', () => {
  it('公式由来の項目と同じ形(ExportEvent)になり、時刻はJST', () => {
    const [e] = manualEvents([flash]);
    expect(e).toMatchObject({ id: 'manual:閃きの遊技場:2024-01-01 00:00', article_id: 'manual', category: 'event', start: '2024-01-01T00:00:00+09:00', end: '2026-12-31T23:59:00+09:00', url: '', group: '定例クエスト' });
  });
  it('クエストセクションの「定例クエスト」の小見出しに入り、公式由来と区別する属性は無い', () => {
    const [e] = manualEvents([flash]);
    expect(sectionOfEvent(e as ExportEvent)?.id).toBe('quest');
    expect(questGroup(e as ExportEvent)).toBe('定例クエスト');
    expect(Object.keys(e as ExportEvent)).not.toContain('manual');
  });
  it('group を省けば通常どおりの振り分け。キャンペーンの group も効く', () => {
    expect(questGroup({ name: '何かの項目' })).toBe('その他');
    expect(campaignGroup({ name: '何かの項目', group: '英雄の神殿' })).toBe('英雄の神殿');
    expect(campaignGroup({ name: '何かの項目', group: '存在しない' })).toBeNull();
  });
  it('選択(selection)の対象外で、常に表示される', () => {
    const shown = applyManual(applySelection([ev('a#0', 'a')], { generated_at: 'x', selected: [], total: 0 }), { add: [flash], hide: [] });
    expect(shown.map((e) => e.name)).toEqual(['閃きの遊技場']);
  });
});

describe('手動の調整: カレンダーへの反映', () => {
  it('期間内の週のクエストセクションに出る。期間外の週には出ない', () => {
    const events = applyManual([], { add: [flash], hide: [] });
    const inRange = ganttSections(events, weekDays('2026-11-02'));
    expect(inRange.map((g) => g.section.id)).toEqual(['quest']);
    expect(inRange[0]?.bars[0]?.event.name).toBe('閃きの遊技場');
    expect(ganttSections(events, weekDays('2027-01-04'))).toEqual([]);
  });
});

describe('手動の調整: hide', () => {
  it('項目IDで外す。メンテナンスにも効き、データ(元のイベント配列)は変えない', () => {
    const events = [ev('20261030_3#0', '20261030_3', 'maintenance'), ev('20261030_4#0', '20261030_4')];
    const shown = applyManual(events, { add: [], hide: [{ id: '20261030_3#0' }] });
    expect(shown.map((e) => e.id)).toEqual(['20261030_4#0']);
    expect(events).toHaveLength(2);
  });
  it('記事IDで、その記事の全項目を外す', () => {
    const events = [ev('9_1#0', '9_1'), ev('9_1#1', '9_1'), ev('9_2#0', '9_2')];
    expect(applyManual(events, { add: [], hide: [{ id: '9_1' }] }).map((e) => e.id)).toEqual(['9_2#0']);
  });
  it('hide を消せば元に戻る', () => {
    const cfg = hideEntry(base, { id: 'x#0', note: '理由' });
    expect(cfg.hide).toEqual([{ id: 'x#0', note: '理由' }]);
    expect(unhideEntry(cfg, 'x#0').hide).toEqual([]);
    expect(() => unhideEntry(base, 'x#0')).toThrow('ありません');
  });
});

describe('手動の調整: 点検と編集', () => {
  it('実在しない日時・終了が開始以前・不正な category/group・重複を検出する', () => {
    const bad = (a: Partial<typeof flash>) => manualProblems({ add: [{ ...flash, ...a }], hide: [] }).problems;
    expect(bad({})).toEqual([]);
    expect(bad({ start: '2026-02-30 00:00' })[0]).toContain('実在する');
    expect(bad({ end: '2024-01-01 00:00' })[0]).toContain('より後');
    expect(bad({ category: 'gacha' as never })[0]).toContain('category');
    expect(bad({ group: 'クエスト以外' })[0]).toContain('group');
    expect(manualProblems({ add: [flash, flash], hide: [] }).problems[0]).toContain('重複');
    expect(manualProblems({ add: [], hide: [{ id: 'a' }, { id: 'a' }] }).problems[0]).toContain('重複');
  });
  it('存在しない項目IDは unknown(警告)に出す', () => {
    expect(manualProblems({ add: [], hide: [{ id: 'zzz' }] }, new Set(['a#0'])).unknown).toEqual(['zzz']);
  });
  it('add は同じ name+start で置き換え、誤りがあれば投げる。remove で取り除く', () => {
    const one = addEntry(base, flash);
    const two = addEntry(one, { ...flash, end: '2027-12-31 23:59' });
    expect(two.add).toHaveLength(1);
    expect(two.add[0]?.end).toBe('2027-12-31 23:59');
    expect(() => addEntry(base, { ...flash, start: 'bad' })).toThrow();
    expect(removeEntry(two, flash.name).add).toEqual([]);
    expect(() => removeEntry(base, flash.name)).toThrow('ありません');
  });
  it('配布中の manual.json は誤りが無い', () => {
    expect(manualProblems(MANUAL).problems).toEqual([]);
  });
});

describe('手動の調整: 色', () => {
  it('color は文字と縁、edge_color で縁だけ別にできる。無指定は色なし', () => {
    const [a, b, c] = manualEvents([flash, { ...flash, name: 'B', color: 'purple' }, { ...flash, name: 'C', color: '#112233', edge_color: 'red' }]) as ExportEvent[];
    expect(a?.color).toBeUndefined();
    expect(b).toMatchObject({ color: '#a237c3', edge_color: '#a237c3' });
    expect(c).toMatchObject({ color: '#112233', edge_color: '#eb0043' });
  });
  it('書式の誤りを検出する', () => {
    const p = (a: object) => manualProblems({ add: [{ ...flash, ...a }], hide: [] }).problems;
    expect(p({ color: 'red', edge_color: 'blue' })).toEqual([]);
    expect(p({ color: 'pink' })[0]).toContain('color');
    expect(p({ edge_color: '#12' })[0]).toContain('edge_color');
  });
});

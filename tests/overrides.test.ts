import { describe, expect, it } from 'vitest';
import type { ExportEvent } from '../src/data/export';
import { applyOverrides, jstText, overrideProblems, setItem, unsetItem, type OverridesConfig } from '../src/overrides';
import { ledgerRows } from '../src/ledger';
import { sectionOfEvent } from '../src/sections';

const ev = (id: string, extra: Partial<ExportEvent> = {}): ExportEvent => ({
  id, article_id: id.split('#')[0] as string, name: '覇者の塔', title: 't', category: 'event', start: '2026-11-03T12:00:00+09:00', end: '2026-11-20T11:59:00+09:00', reward_until: null, url: 'https://x/y',
  slots: [{ start: '2026-11-03T12:00:00+09:00', end: '2026-11-03T13:00:00+09:00' }], details: [{ label: '対象ステージ', lines: ['・A'] }, { label: '注意', lines: ['・B'] }], ...extra,
});
const cfg = (items: OverridesConfig['items']): OverridesConfig => ({ items });

describe('項目ごとの修正: 適用', () => {
  it('空の設定は何も変えない(同じ配列を返す)', () => {
    const a = [ev('a#0')];
    expect(applyOverrides(a, cfg([]))).toBe(a);
  });
  it('期間・名前を直し、期間を直すと日別の時間帯は外す。元は変えない', () => {
    const a = [ev('a#0'), ev('b#0')];
    const out = applyOverrides(a, cfg([{ id: 'a#0', set: { name: '新名', start: '2026-11-04 13:00', end: '2026-11-21 11:59' } }]));
    expect(out[0]).toMatchObject({ name: '新名', start: '2026-11-04T13:00:00+09:00', end: '2026-11-21T11:59:00+09:00', fix: { fields: ['name', 'start', 'end'] } });
    expect(out[0]?.slots).toBeUndefined();
    expect(out[1]).toBe(a[1]);
    expect(a[0]?.name).toBe('覇者の塔');
  });
  it('期間を直さなければ日別の時間帯は残る', () => {
    const [o] = applyOverrides([ev('a#0')], cfg([{ id: 'a#0', set: { name: 'x' } }]));
    expect(o?.slots).toHaveLength(1);
  });
  it('詳細: ブロックの非表示・追加(同じ見出しは置換)・注記', () => {
    const [o] = applyOverrides([ev('a#0')], cfg([{ id: 'a#0', set: { hide_blocks: ['注意'], add_blocks: [{ label: '対象ステージ', lines: ['・C'] }, { label: '補足', lines: ['1'] }], notes: ['メモ'] } }]));
    expect(o?.details?.map((b) => [b.label, b.lines])).toEqual([['対象ステージ', ['・C']], ['補足', ['1']]]);
    expect(o?.fix).toMatchObject({ notes: ['メモ'], hide_blocks: ['注意'] });
  });
  it('セクションを指定するとそのセクションに入る', () => {
    const [o] = applyOverrides([ev('a#0')], cfg([{ id: 'a#0', set: { section: 'campaign' } }]));
    expect(sectionOfEvent(o as ExportEvent)?.id).toBe('campaign');
    expect(sectionOfEvent(ev('a#0'))?.id).toBe('quest');
  });
});

describe('項目ごとの修正: 点検と編集', () => {
  const official = new Map([['a#0', { name: '覇者の塔', start: '2026-11-03T12:00:00+09:00', end: '2026-11-20T11:59:00+09:00' }]]);
  it('誤りを検出する', () => {
    const p = overrideProblems(cfg([{ id: 'manual:x', set: {} }, { id: 'a#0', set: { start: '2026-02-30 10:00', section: 'nope', group: 'x', name: ' ' } }, { id: 'a#0', set: { add_blocks: [{ label: '', lines: [] }] } }])).problems.join('\n');
    for (const w of ['manual・monthly', 'set が空', 'start は実在', 'section は', 'group', 'name が空', '重複', 'add_blocks']) expect(p).toContain(w);
  });
  it('存在しないID・公式の値の変化(was)・不要な修正を分けて返す', () => {
    const r = overrideProblems(cfg([{ id: 'zzz#0', set: { name: 'x' } }, { id: 'a#0', set: { end: '2026-11-25 00:00', name: '覇者の塔' }, was: { end: '2026-11-19 11:59' } }]), official);
    expect(r.problems).toEqual([]);
    expect(r.unknown).toEqual(['zzz#0']);
    expect(r.stale[0]).toContain('a#0(end: 修正時 2026-11-19 11:59 → 今 2026-11-20 11:59)');
    expect(r.redundant).toEqual(['a#0(name)']);
  });
  it('編集: 追加・置換・取り消し', () => {
    let c = setItem(cfg([]), { id: 'a#0', set: { name: 'x' } });
    c = setItem(c, { id: 'a#0', set: { name: 'y' } });
    expect(c.items).toHaveLength(1);
    expect(() => setItem(c, { id: 'a#1', set: { start: 'bad' } })).toThrow();
    expect(unsetItem(c, 'a#0').items).toEqual([]);
    expect(() => unsetItem(c, 'zzz')).toThrow();
  });
  it('jstText は ISO を JST の分まで', () => expect(jstText('2026-11-03T03:00:00Z')).toBe('2026-11-03 12:00'));
});

describe('項目ごとの修正: 台帳', () => {
  it('修正の入った項目は修正後の値で載り、「修正」の列に直した項目が出る', () => {
    const [o] = applyOverrides([ev('a#0')], cfg([{ id: 'a#0', set: { start: '2026-11-04 13:00', notes: ['メモ'] } }]));
    const row = ledgerRows([o as ExportEvent], '2026-11').find((r) => r.id === 'a#0');
    expect(row?.fixed).toBe('修正: 開始・注記');
    expect(row?.content).toContain('注記: メモ');
    expect(row?.start).toBe('2026-11-04T13:00:00+09:00');
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import config from '../config/display/discord.json';
import type { ExportEvent, IndexFile } from '../src/data/export';
import { characterGroup, gachaGroup, groupDefs } from '../src/sections';
import { SUMMARY, SHOT_4AM_FRAC, compactCharacterRows, startDayBars, shotEndFrac, shotStartFrac, summaryBlocks, isDay, parseShot, shotConfigProblems, type SummaryConfig } from '../src/shot';
import { initialState, render } from '../src/ui';
import { campaignGroup, ganttSections, questGroup, weekDays } from '../src/week';

const ev = (id: string, category: string, name: string, start = '2026-11-05T04:00:00+09:00', end: string | null = '2026-11-08T03:59:00+09:00', extra: Partial<ExportEvent> = {}): ExportEvent => ({
  id, article_id: id.split('#')[0] as string, name, title: `t-${id}`, category, start, end, reward_until: null, url: `https://example.test/${id}`, ...extra,
});
const INDEX: IndexFile = { generated_at: '2026-11-05T09:00:00+09:00', collected_at: '2026-11-05T08:00:00+09:00', months: ['2026-11'], categories: [] };
const EVENTS = [
  ev('q#0', 'event', '覇者の塔'),
  ev('c#0', 'campaign', 'モンストの日'),
  ev('c#1', 'campaign', 'CM視聴でオーブ'),
  ev('g#0', 'collab', 'ガチャ「テスト作品」'),
  ev('m#0', 'maintenance', 'メンテナンス', '2026-11-06T00:00:00+09:00', '2026-11-06T05:00:00+09:00'),
];
const cfg = (...blocks: SummaryConfig['blocks']): SummaryConfig => ({ blocks });
const grp = (sectionId: string, e: ExportEvent): string | null => (sectionId === 'character' ? characterGroup(e) : sectionId === 'quest' ? questGroup(e) : sectionId === 'gacha' ? gachaGroup(e) : campaignGroup(e));

describe('撮影モードのURLパラメータ', () => {
  it('shot と date を読む。shot が無い・不正なら通常表示(null)、date が不正なら無視', () => {
    expect(parseShot('?shot=quest&date=2026-11-05')).toEqual({ kind: 'quest', date: '2026-11-05' });
    expect(parseShot('?shot=summary')).toEqual({ kind: 'summary', date: null });
    expect(parseShot('?shot=gacha&date=2026-02-30')).toEqual({ kind: 'gacha', date: null });
    expect(parseShot('')).toBeNull();
    expect(parseShot('?shot=other')).toBeNull();
  });
  it('isDay は実在の日付だけ', () => {
    expect(isDay('2026-11-05')).toBe(true);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('26-11-05')).toBe(false);
  });
});

describe('概要の設定(discord.json の summary.blocks)', () => {
  it('現在の設定に誤りは無い。並びは モンストの日→特Lの園→イベントクエスト→期間限定ガチャ→絶級・期間限定・超究極(開催日のみ)→新限定→進化→定例クエスト', () => {
    expect(shotConfigProblems(undefined, undefined, (s) => groupDefs(s).map((g) => g.name))).toEqual([]);
    expect(SUMMARY.blocks.map((b) => `${b.section}:${(b.groups ?? b.keywords ?? []).join('+')}`)).toEqual([
      'campaign:モンストの日', 'campaign:特Lの園', 'quest:イベントクエスト', 'gacha:期間限定ガチャ', 'quest:絶級クエスト+期間限定クエスト+超究極クエスト', 'character:新限定', 'character:進化', 'quest:定例クエスト',
    ]);
    expect(config.summary.blocks[4]?.start_day_only).toBe(true);
  });
  it('誤りを見つける', () => {
    const ids = ['character', 'quest', 'campaign', 'gacha'];
    const names = (s: string) => groupDefs(s).map((g) => g.name);
    expect(shotConfigProblems(cfg(), ids, names)).toHaveLength(1);
    expect(shotConfigProblems(cfg({ section: 'nope' }), ids, names).join()).toContain('nope');
    expect(shotConfigProblems(cfg({ section: 'campaign', groups: ['存在しない'] }), ids, names).join()).toContain('存在しない');
    expect(shotConfigProblems(cfg({ section: 'campaign', hide_keywords: [' '] }), ids, names).join()).toContain('空の語');
    expect(shotConfigProblems(cfg({ section: 'campaign', keywords: [] }), ids, names).join()).toContain('1つ以上');
    expect(shotConfigProblems(cfg({ section: 'quest', max_rows: 0 }), ids, names).join()).toContain('1以上');
    expect(shotConfigProblems(cfg({ section: 'quest', start_day_only: 'yes' as never }), ids, names).join()).toContain('true / false');
  });
});

describe('概要のブロックの動作', () => {
  const secs = () => ganttSections([...EVENTS, ev('q#1', 'event', '禁忌の獄'), ev('e#0', 'campaign', '特Lの園が出現!')], weekDays('2026-11-05'));
  const names = (blocks: SummaryConfig['blocks']) => summaryBlocks(secs(), grp, { blocks }).flatMap((e) => e.rows.map((r) => r[0]!.event.name));
  it('ブロックは設定の順に並ぶ(セクションをまたいでよい)', () => {
    expect(names([{ section: 'campaign', keywords: ['モンストの日'] }, { section: 'quest', groups: ['定例クエスト'] }, { section: 'campaign', keywords: ['特Lの園'] }])).toEqual(['モンストの日', '覇者の塔', '禁忌の獄', '特Lの園が出現!']);
  });
  it('語で残す・外す、行数で切る。書いていないものは出ない', () => {
    expect(names([{ section: 'campaign', keywords: ['モンストの日'] }])).toEqual(['モンストの日']);
    expect(names([{ section: 'campaign', hide_keywords: ['モンストの日', '特L'] }])).toEqual(['CM視聴でオーブ']);
    expect(names([{ section: 'quest', groups: ['定例クエスト'], max_rows: 1 }])).toHaveLength(1);
    expect(names([{ section: 'gacha', groups: ['期間限定ガチャ'] }])).toEqual([]); // 行が無いブロックは出ない
  });
  it('小見出しの指定: 複数ならその順。小見出しは groups を書いたブロックだけ出す(既定)', () => {
    const es = summaryBlocks(secs(), grp, { blocks: [{ section: 'quest', groups: ['定例クエスト'] }, { section: 'campaign', keywords: ['モンストの日'] }, { section: 'campaign', keywords: ['特L'], headings: true }] });
    expect(es.map((e) => e.headings)).toEqual([true, false, true]);
    const two = summaryBlocks(
      ganttSections([ev('a#0', 'event', '期間限定クエスト あ', undefined, undefined, { group: '期間限定クエスト' }), ev('b#0', 'event', '黎絶 い降臨')], weekDays('2026-11-05')),
      grp,
      { blocks: [{ section: 'quest', groups: ['期間限定クエスト', '絶級クエスト'] }] },
    );
    expect(two[0]!.rows.map((r) => questGroup(r[0]!.event))).toEqual(['期間限定クエスト', '絶級クエスト']);
  });
});

describe('撮影モードの描画', () => {
  const draw = (shot: 'summary' | 'character' | 'quest' | 'campaign' | 'gacha') => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', EVENTS, INDEX);
    state.shot = shot;
    render(root, state);
    return root;
  };
  it('単独の画像は、そのセクションだけ出す(日付ヘッダとメンテの帯は全画像に出る)', () => {
    for (const k of ['quest', 'campaign', 'gacha'] as const) {
      const root = draw(k);
      expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => x.dataset.section)).toEqual([k]);
      expect(root.querySelectorAll('.g-date')).toHaveLength(7);
      expect(root.querySelectorAll('.g-maint')).toHaveLength(1);
    }
  });
  it('概要は、セクションの大見出しを出さず、操作・詳細・注意書きも出さず、フッター(注記)も出さない', () => {
    const root = draw('summary');
    expect(root.querySelectorAll('.g-section')).toHaveLength(0);
    expect(root.querySelector('.view-nav')).toBeNull();
    expect(root.querySelector('[data-testid="detail"]')).toBeNull();
    expect(root.querySelector('.site-footer')).toBeNull();
    expect(root.querySelector('.shot-note')).toBeNull();
    expect(root.textContent).not.toContain('非公式');
  });
});

describe('キャラクターの画像と、概要の既定の絞り込み', () => {
  const chara = ev('k#c0', 'character', '桜（獣神化・改）', '2026-11-06T00:00:00+09:00', '2026-11-07T00:00:00+09:00', { character: { kind: '獣神化・改', at: '2026-11-06T12:00:00+09:00' } });
  const all = [
    ...EVENTS,
    chara,
    ev('j#0', 'event', '常設の何かクエスト', '2026-11-01T00:00:00+09:00', '2026-12-01T00:00:00+09:00', { group: '常設クエスト' }),
    ev('e#0', 'campaign', '特Lの園が出現!'),
    ev('e#1', 'campaign', 'スコア報酬5倍'),
  ];
  const draw2 = (shot: 'summary' | 'character') => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', all, INDEX);
    state.shot = shot;
    render(root, state);
    return root;
  };
  it('キャラクターの単独画像は、キャラクターのセクションだけ(日付ヘッダ・メンテの帯あり)', () => {
    const root = draw2('character');
    expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => x.dataset.section)).toEqual(['character']);
    expect(root.querySelectorAll('.g-date')).toHaveLength(7);
    expect(root.querySelectorAll('.g-maint')).toHaveLength(1);
  });
  it('概要: 上から モンストの日→特Lの園→イベントクエスト→…→新限定/進化→定例クエスト。常設クエストなどは出ない', () => {
    const root = draw2('summary');
    const labels = [...root.querySelectorAll('.g-row:not(.g-dates) > .g-label')].map((x) => x.textContent?.replace(/\s+/g, ''));
    const heads = [...root.querySelectorAll('.g-group')].map((x) => x.textContent);
    const at = (t: string): number => labels.findIndex((l) => l?.startsWith(t));
    expect(at('モンストの日')).toBeGreaterThanOrEqual(0);
    expect(at('モンストの日')).toBeLessThan(at('特Lの園'));
    expect(at('特Lの園')).toBeLessThan(at('覇者の塔'));
    expect(heads).toEqual(['イベントクエスト', '進化', '定例クエスト']); // 小見出しは groups のあるブロックだけ。上から設定の順(イベントは通常ガチャの写し)
    const text = root.textContent ?? '';
    expect(text).toContain('桜');
    expect(text).not.toContain('常設の何か');
    expect(text).not.toContain('スコア報酬5倍');
    expect(text).not.toContain('CM視聴');
  });
});

describe('開催日だけの表示(start_day_only)', () => {
  const week = weekDays('2026-11-05');
  const rows = (events: ExportEvent[]) => ganttSections(events, week).find((s) => s.section.id === 'quest')!.rows;
  const f = (events: ExportEvent[]) => summaryBlocks(ganttSections(events, week), grp, cfg({ section: 'quest', groups: ['期間限定クエスト', '定例クエスト'], start_day_only: true })).flatMap((e) => e.rows);

  it('その週に始まるものは、開始日の列1日分(罫線から罫線まで。開始時刻は問わない)に縮め、矢印も付けない', () => {
    const e = ev('t#0', 'event', '期間限定クエスト テスト', '2026-11-06T12:00:00+09:00', '2026-11-12T03:59:00+09:00', { group: '期間限定クエスト' });
    const b = f([e])[0]![0]!;
    expect([b.from, b.to, b.endFrac, b.clippedRight, b.openEnded]).toEqual([1, 1, 1, false, false]);
    expect(b.startFrac).toBe(0);
  });
  it('その週より前に始まったものは出さない。ブロックの全小見出しに効く', () => {
    const old = ev('t#1', 'event', '期間限定クエスト 古い', '2026-11-01T12:00:00+09:00', '2026-11-12T03:59:00+09:00', { group: '期間限定クエスト' });
    expect(f([old])).toHaveLength(0);
    // 開催日だけは、ブロック全体に効く(groups に書いた小見出しすべて)
    const fixed = ev('t#2', 'event', '覇者の塔', '2026-11-06T12:00:00+09:00', '2026-11-12T03:59:00+09:00');
    expect(f([fixed])[0]![0]!.to).toBe(f([fixed])[0]![0]!.from);
  });
  it('startDayBars は開始がその表示期間にあるバーだけを返す', () => {
    const e = ev('t#3', 'event', '期間限定クエスト x', '2026-11-05T12:00:00+09:00', '2026-11-09T12:00:00+09:00', { group: '期間限定クエスト' });
    expect(startDayBars(rows([e])[0]!)).toHaveLength(1);
  });
});

describe('撮影モードのバーの端', () => {
  it('4:00(03:59含む)の開始も終わりも同じ位置へずらし、他は変えない', () => {
    expect(shotEndFrac(4 / 24)).toBe(SHOT_4AM_FRAC);
    expect(shotEndFrac((3 * 60 + 59) / 1440)).toBe(SHOT_4AM_FRAC);
    expect(shotStartFrac(4 / 24)).toBe(SHOT_4AM_FRAC);
    expect(shotEndFrac(0.5)).toBe(0.5);
    expect(shotStartFrac(0.5)).toBe(0.5);
    expect(shotEndFrac(1)).toBe(1);
    expect(shotEndFrac((23 * 60 + 59) / 1440)).toBe(1);
    expect(shotStartFrac(1 / 1440)).toBe(0);
    expect(shotStartFrac(0)).toBe(0);
  });
  const margins = (shot: boolean, start: string, end: string): { l: string; r: string } => {
    const e = ev('x#0', 'campaign', 'テスト', start, end);
    const root = document.createElement('div');
    const state = initialState('2026-11-05', [e], INDEX);
    if (shot) state.shot = 'campaign';
    render(root, state);
    const b = root.querySelector<HTMLElement>('.bar-ev')!;
    return { l: b.style.marginLeft, r: b.style.marginRight };
  };
  it('通常表示のバーは変えず、撮影モードだけ4:00の端が伸びる', () => {
    const a = '2026-11-05T04:00:00+09:00';
    const b = '2026-11-06T04:00:00+09:00';
    expect(margins(false, a, b).l).toContain('8.333');
    expect(margins(true, a, b).l).toBe('calc(10.000%)');
    expect(margins(false, a, b).r).toContain('41.667');
    expect(margins(true, a, b).r).toBe('calc(40.000%)');
  });
  it('撮影モードの0:00開始・24:00終了は余白なしで罫線に接する(通常表示は従来のまま)', () => {
    const a = '2026-11-06T00:00:00+09:00';
    const b = '2026-11-07T00:00:00+09:00';
    expect(margins(true, a, b)).toEqual({ l: '0px', r: '0px' });
    expect(margins(false, a, b)).toEqual({ l: '', r: '' });
  });
});

describe('撮影モードの行数対策(キャラクター)', () => {
  const chara = (id: string, name: string, kind: '新限定' | '獣神化・改' | '真獣神化', start: string, end: string, extra: Partial<ExportEvent> = {}, character: Record<string, string> = {}): ExportEvent =>
    ev(id, 'character', name, start, end, { character: { kind, ...character }, ...extra });
  const D = (d: number) => `2026-11-${String(d).padStart(2, '0')}T00:00:00+09:00`;
  const evs = [
    chara('n#c0', 'カーミラ（彩・獣神祭）', '新限定', '2026-11-07T12:00:00+09:00', '2026-11-10T11:59:00+09:00', { color: '#eb0043' }, { gacha: '彩・獣神祭' }),
    chara('n#c1', 'ツクモ（彩・獣神祭）', '新限定', '2026-11-07T12:00:00+09:00', '2026-11-10T11:59:00+09:00', { color: '#007d32' }, { gacha: '彩・獣神祭' }),
    chara('o#c0', 'ほか（グリーンファンタジー）', '新限定', '2026-11-08T12:00:00+09:00', '2026-11-10T11:59:00+09:00', {}, { gacha: 'グリーンファンタジー' }),
    chara('e#c0', 'A（獣神化・改）', '獣神化・改', D(9), D(10), { color: '#eb0043' }, { at: '2026-11-09T12:00:00+09:00' }),
    chara('e#c1', 'B（獣神化・改）', '獣神化・改', D(9), D(10), {}, { at: '2026-11-09T22:00:00+09:00' }),
    chara('e#c2', 'C（真獣神化）', '真獣神化', D(10), D(11), {}, { at: '2026-11-10T12:00:00+09:00' }),
  ];
  const rows = () => ganttSections(evs, weekDays('2026-11-05')).find((s) => s.section.id === 'character')!.rows;

  it('同じガチャ・同じ期間の新限定は1行(名前と属性色を持つ)。期間が違えば別の行。進化は種別ごとに1行', () => {
    const r = compactCharacterRows(rows());
    expect(r).toHaveLength(4);
    const merged = r[0]![0]!.event;
    expect(merged.shot_names).toEqual([{ name: 'カーミラ', color: '#eb0043' }, { name: 'ツクモ', color: '#007d32' }]);
    expect(merged.name).toBe('カーミラ・ツクモ（彩・獣神祭）');
    expect(r[1]![0]!.event.shot_names).toEqual([{ name: 'ほか' }]); // 1体でも同じ形(ラベルはガチャ名、名前は線の上)
    const kai = r[2]!;
    expect(kai.map((b) => b.event.name)).toEqual(['A（獣神化・改）', 'B（獣神化・改）']); // 同じ日は解禁の時刻順
    expect(r[3]!.map((b) => b.event.name)).toEqual(['C（真獣神化）']);
  });

  it('キャラクターでない行はそのまま通す', () => {
    const q = ganttSections([ev('q#0', 'event', '覇者の塔')], weekDays('2026-11-05')).find((s) => s.section.id === 'quest')!.rows;
    expect(compactCharacterRows(q)).toEqual(q);
  });

  const draw = (shot: 'character' | 'summary') => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', evs, INDEX);
    state.shot = shot;
    render(root, state);
    return root;
  };
  it('撮影モード: 新限定はラベルがガチャ名で、名前(属性色)の下に平たい線で期間を表す。進化は日付の枠に名前を縦に並べる(バーなし・種別ラベルに色なし)', () => {
    const root = draw('character');
    const labels = [...root.querySelectorAll('.g-row:not(.g-dates) > .g-label')].map((x) => x.textContent);
    expect(labels).toEqual(['彩・獣神祭', 'グリーンファンタジー', '獣神化・改', '真獣神化']);
    const spans = [...root.querySelectorAll<HTMLElement>('.g-span')];
    expect(spans).toHaveLength(2);
    expect(spans[0]!.querySelector('.g-span-names')?.textContent).toBe('カーミラツクモ');
    expect(spans[0]!.querySelector('.g-span-line')).not.toBeNull();
    expect(spans[0]!.style.gridColumn.replace(/\s/g, '')).toBe('4/8'); // 11/7 12:00〜11/10 11:59 → 11/7〜11/10 の4列(11/5 起点。ラベルの列が1なので grid は 4/8)
    expect(root.querySelectorAll('.g-span .g-name.colored')).toHaveLength(2);
    expect(root.querySelectorAll('.g-chips')).toHaveLength(14); // 2行 × 7日
    const chips = [...root.querySelectorAll('.g-chip')].map((x) => x.textContent);
    expect(chips).toEqual(['A', 'B', 'C']);
    expect(root.querySelectorAll('.g-chip.colored')).toHaveLength(1);
    const kind = root.querySelector('.g-row:not(.g-dates) > .g-label.colored');
    expect(kind).toBeNull();
    // キャラクターの行にバーは出ない(新限定は線、進化は名前)
    expect(root.querySelectorAll('.bar-ev')).toHaveLength(0);
  });
  it('通常表示(撮影モードでない)は1キャラ1行のまま', () => {
    const root = document.createElement('div');
    render(root, initialState('2026-11-05', evs, INDEX));
    expect(root.querySelectorAll('.g-row:not(.g-dates) > .g-label')).toHaveLength(6);
    expect(root.querySelectorAll('.g-chips')).toHaveLength(0);
  });
});

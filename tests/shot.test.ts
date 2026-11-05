// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import config from '../config/display/discord.json';
import type { ExportEvent, IndexFile } from '../src/data/export';
import { gachaGroup, groupDefs } from '../src/sections';
import { SUMMARY, SHOT_4AM_FRAC, startDayBars, shotEndFrac, shotStartFrac, filterSummaryRows, isDay, parseShot, shotConfigProblems, type SummaryConfig } from '../src/shot';
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
const sections = () => ganttSections(EVENTS, weekDays('2026-11-05'));
const groupOf = (section: string) => (e: ExportEvent) => (section === 'quest' ? questGroup(e) : section === 'gacha' ? gachaGroup(e) : campaignGroup(e));
const cfg = (over: Partial<SummaryConfig> = {}): SummaryConfig => ({ sections: ['quest', 'campaign', 'gacha'], hide_groups: {}, hide_keywords: {}, only_keywords: {}, start_day_only: {}, max_rows: {}, ...over });
const campaignRows = () => sections().find((s) => s.section.id === 'campaign')!.rows;
const names = (rows: ReturnType<typeof campaignRows>) => rows.map((r) => r[0]!.event.name);

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

describe('概要の絞り込み設定(discord.json)', () => {
  it('現在の設定に誤りは無い(キャラクター・クエスト・キャンペーン・ガチャを絞って出す)', () => {
    expect(shotConfigProblems(undefined, undefined, (s) => groupDefs(s).map((g) => g.name))).toEqual([]);
    expect(SUMMARY.sections).toEqual(['character', 'quest', 'campaign', 'gacha']);
    expect(config.summary.only_keywords).toEqual({ campaign: ['モンストの日', '特Lの園'] });
    expect(config.summary.start_day_only).toEqual({ quest: ['絶級クエスト', '期間限定クエスト', '超究極クエスト'] });
    expect(config.summary.hide_groups).toEqual({ quest: ['常設クエスト', 'その他'], gacha: ['イベントガチャ', '定例ガチャ'] });
  });
  it('誤りを見つける', () => {
    const ids = ['character', 'quest', 'campaign', 'gacha'];
    const names = (s: string) => groupDefs(s).map((g) => g.name);
    expect(shotConfigProblems(cfg({ sections: [] }), ids, names)).toHaveLength(1);
    expect(shotConfigProblems(cfg({ sections: ['nope'] }), ids, names).join()).toContain('nope');
    expect(shotConfigProblems(cfg({ hide_groups: { campaign: ['存在しない'] } }), ids, names).join()).toContain('存在しない');
    expect(shotConfigProblems(cfg({ hide_keywords: { campaign: [' '] } }), ids, names).join()).toContain('空の語');
    expect(shotConfigProblems(cfg({ max_rows: { quest: 0 } }), ids, names).join()).toContain('1以上');
    expect(shotConfigProblems(cfg({ start_day_only: { quest: ['存在しない'] } }), ids, names).join()).toContain('存在しない');
    expect(shotConfigProblems(cfg({ only_keywords: { nope: ['x'] } }), ids, names).join()).toContain('nope');
  });
});

describe('概要の絞り込みの動作', () => {
  const rows = campaignRows();
  const f = (c: SummaryConfig) => names(filterSummaryRows('campaign', rows, groupOf('campaign'), c));
  it('既定(何も指定しない)は全行そのまま', () => expect(f(cfg())).toEqual(names(rows)));
  it('小見出し・語で外し、only で残し、行数で切る', () => {
    expect(f(cfg({ hide_groups: { campaign: ['ミッション'] } }))).not.toContain('CM視聴でオーブ');
    expect(f(cfg({ hide_keywords: { campaign: ['モンストの日'] } }))).not.toContain('モンストの日');
    expect(f(cfg({ only_keywords: { campaign: ['モンストの日'] } }))).toEqual(['モンストの日']);
    expect(f(cfg({ max_rows: { campaign: 1 } }))).toHaveLength(1);
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
  it('概要は設定のセクションを出し、操作・詳細・注意書きは出さず、フッター(注記)も出さない', () => {
    const root = draw('summary');
    // ガチャはイベントガチャだけで、概要の絞り込みで行が無くなるため、見出しも出さない
    expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => x.dataset.section)).toEqual(['quest', 'campaign']);
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
  const drawAll = (shot: 'summary' | 'character') => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', all, INDEX);
    state.shot = shot;
    render(root, state);
    return root;
  };
  it('キャラクターの単独画像は、キャラクターのセクションだけ(日付ヘッダ・メンテの帯あり)', () => {
    const root = drawAll('character');
    expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => x.dataset.section)).toEqual(['character']);
    expect(root.querySelectorAll('.g-date')).toHaveLength(7);
    expect(root.querySelectorAll('.g-maint')).toHaveLength(1);
  });
  it('概要: キャラクターを出し、常設クエストは外し、キャンペーンはモンストの日・特Lの園だけ', () => {
    const root = drawAll('summary');
    expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => x.dataset.section)).toEqual(['character', 'quest', 'campaign']); // 行の無いガチャは出ない
    const text = root.textContent ?? '';
    expect(text).toContain('桜');
    expect(text).toContain('覇者の塔');
    expect(text).not.toContain('常設の何か');
    expect(text).toContain('モンストの日');
    expect(text).toContain('特Lの園');
    expect(text).not.toContain('スコア報酬5倍');
    expect(text).not.toContain('CM視聴');
  });
});

describe('開催日だけの表示(start_day_only)', () => {
  const week = weekDays('2026-11-05');
  const rows = (events: ExportEvent[]) => ganttSections(events, week).find((s) => s.section.id === 'quest')!.rows;
  const only = cfg({ start_day_only: { quest: ['期間限定クエスト'] } });
  const f = (events: ExportEvent[]) => filterSummaryRows('quest', rows(events), questGroup, only);

  it('その週に始まるものは、開始日の列1日分(罫線から罫線まで。開始時刻は問わない)に縮め、矢印も付けない', () => {
    const e = ev('t#0', 'event', '期間限定クエスト テスト', '2026-11-06T12:00:00+09:00', '2026-11-12T03:59:00+09:00', { group: '期間限定クエスト' });
    const b = f([e])[0]![0]!;
    expect([b.from, b.to, b.endFrac, b.clippedRight, b.openEnded]).toEqual([1, 1, 1, false, false]);
    expect(b.startFrac).toBe(0);
  });
  it('その週より前に始まったものは出さない。対象外の小見出しはそのまま', () => {
    const old = ev('t#1', 'event', '期間限定クエスト 古い', '2026-11-01T12:00:00+09:00', '2026-11-12T03:59:00+09:00', { group: '期間限定クエスト' });
    expect(f([old])).toHaveLength(0);
    const fixed = ev('t#2', 'event', '覇者の塔', '2026-11-01T12:00:00+09:00', '2026-11-12T03:59:00+09:00');
    expect(f([fixed])).toHaveLength(1);
    expect(f([fixed])[0]![0]!.to).toBeGreaterThan(1);
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

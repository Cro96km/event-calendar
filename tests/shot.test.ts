// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import config from '../config/display/discord.json';
import type { ExportEvent, IndexFile } from '../src/data/export';
import { gachaGroup, groupDefs } from '../src/sections';
import { SUMMARY, SHOT_MIN_END_FRAC, shotEndFrac, filterSummaryRows, isDay, parseShot, shotConfigProblems, type SummaryConfig } from '../src/shot';
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
const cfg = (over: Partial<SummaryConfig> = {}): SummaryConfig => ({ sections: ['quest', 'campaign', 'gacha'], hide_groups: {}, hide_keywords: [], only_keywords: [], max_rows: {}, ...over });
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
  it('現在の設定に誤りは無く、初期値は絞らない', () => {
    expect(shotConfigProblems(undefined, undefined, (s) => groupDefs(s).map((g) => g.name))).toEqual([]);
    expect(SUMMARY.sections).toEqual(['quest', 'campaign', 'gacha']);
    expect(config.summary.hide_keywords).toEqual([]);
    expect(config.summary.only_keywords).toEqual([]);
  });
  it('誤りを見つける', () => {
    const ids = ['quest', 'campaign', 'gacha'];
    const names = (s: string) => groupDefs(s).map((g) => g.name);
    expect(shotConfigProblems(cfg({ sections: [] }), ids, names)).toHaveLength(1);
    expect(shotConfigProblems(cfg({ sections: ['nope'] }), ids, names).join()).toContain('nope');
    expect(shotConfigProblems(cfg({ hide_groups: { campaign: ['存在しない'] } }), ids, names).join()).toContain('存在しない');
    expect(shotConfigProblems(cfg({ hide_keywords: [' '] }), ids, names).join()).toContain('空の語');
    expect(shotConfigProblems(cfg({ max_rows: { quest: 0 } }), ids, names).join()).toContain('1以上');
  });
});

describe('概要の絞り込みの動作', () => {
  const rows = campaignRows();
  const f = (c: SummaryConfig) => names(filterSummaryRows('campaign', rows, groupOf('campaign'), c));
  it('既定(何も指定しない)は全行そのまま', () => expect(f(cfg())).toEqual(names(rows)));
  it('小見出し・語で外し、only で残し、行数で切る', () => {
    expect(f(cfg({ hide_groups: { campaign: ['ミッション'] } }))).not.toContain('CM視聴でオーブ');
    expect(f(cfg({ hide_keywords: ['モンストの日'] }))).not.toContain('モンストの日');
    expect(f(cfg({ only_keywords: ['モンストの日'] }))).toEqual(['モンストの日']);
    expect(f(cfg({ max_rows: { campaign: 1 } }))).toHaveLength(1);
  });
});

describe('撮影モードの描画', () => {
  const draw = (shot: 'summary' | 'quest' | 'campaign' | 'gacha') => {
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
  it('概要は3セクションとも出し、操作・詳細・注意書きは出さず、フッター(注記)も出さない', () => {
    const root = draw('summary');
    expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => x.dataset.section)).toEqual(['quest', 'campaign', 'gacha']);
    expect(root.querySelector('.view-nav')).toBeNull();
    expect(root.querySelector('[data-testid="detail"]')).toBeNull();
    expect(root.querySelector('.site-footer')).toBeNull();
    expect(root.querySelector('.shot-note')).toBeNull();
    expect(root.textContent).not.toContain('非公式');
  });
});

describe('撮影モードの4:00終わりのバー', () => {
  it('4:00(03:59含む)終わりだけ伸ばし、他の終わりは変えない', () => {
    expect(shotEndFrac(4 / 24)).toBe(SHOT_MIN_END_FRAC);
    expect(shotEndFrac((3 * 60 + 59) / 1440)).toBe(SHOT_MIN_END_FRAC);
    expect(shotEndFrac(0.5)).toBe(0.5);
    expect(shotEndFrac(1)).toBe(1);
    expect(shotEndFrac(2 / 24)).toBe(2 / 24);
  });
  it('通常表示のバーは変えず、撮影モードだけ右の余白が小さくなる', () => {
    const e = ev('x#0', 'campaign', 'テスト', '2026-11-04T04:00:00+09:00', '2026-11-05T04:00:00+09:00');
    const margin = (shot: boolean): string => {
      const root = document.createElement('div');
      const state = initialState('2026-11-05', [e], INDEX);
      if (shot) state.shot = 'campaign';
      render(root, state);
      return root.querySelector<HTMLElement>('.bar-ev')!.style.marginRight;
    };
    expect(margin(false)).toContain('83.333');
    expect(margin(true)).toContain('72.000');
  });
});

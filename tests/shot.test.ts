// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import config from '../config/display/discord.json';
import type { ExportEvent, IndexFile } from '../src/data/export';
import { gachaGroup, groupDefs } from '../src/sections';
import { foldNewLimited } from '../src/newlimited';
import { SUMMARY, startDayBars, summaryBlocks, isDay, parseShot, shotConfigProblems, type SummaryConfig } from '../src/shot';
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
const cfg = (...blocks: SummaryConfig['blocks']): SummaryConfig => ({ label: 'ハイライト', blocks });
const grp = (sectionId: string, e: ExportEvent): string | null => (sectionId === 'quest' ? questGroup(e) : sectionId === 'gacha' ? gachaGroup(e) : campaignGroup(e));

describe('撮影モードのURLパラメータ', () => {
  it('shot と date を読む。shot が無い・不正なら通常表示(null)、date が不正なら無視', () => {
    expect(parseShot('?shot=quest&date=2026-11-05')).toEqual({ kind: 'quest', date: '2026-11-05', theme: 'light' });
    expect(parseShot('?shot=summary')).toEqual({ kind: 'summary', date: null, theme: 'light' });
    expect(parseShot('?shot=gacha&date=2026-02-30')).toEqual({ kind: 'gacha', date: null, theme: 'light' });
    expect(parseShot('?shot=quest&theme=dark')?.theme).toBe('dark');
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
  it('現在の設定に誤りは無い。並びは モンストの日→特Lの園→イベントクエスト→絶級・期間限定・超究極(開催日のみ)→期間限定ガチャ→新限定(ガチャのバーの名前)→進化→定例クエスト', () => {
    expect(shotConfigProblems(undefined, undefined, (s) => groupDefs(s).map((g) => g.name))).toEqual([]);
    expect(SUMMARY.blocks.map((b) => `${b.section}:${(b.groups ?? b.keywords ?? []).join('+')}`)).toEqual([
      'campaign:モンストの日', 'campaign:特Lの園', 'quest:イベントクエスト', 'quest:絶級クエスト+期間限定クエスト+超究極クエスト', 'gacha:期間限定ガチャ', 'gacha:', 'gacha:進化', 'quest:定例クエスト',
    ]);
    expect(config.summary.blocks[3]?.start_day_only).toBe(true);
    expect(config.summary.blocks[5]?.with_new_limited).toBe(true);
  });
  it('概要の見出し(label)は空でない文字列。現在の設定は「ハイライト」', () => {
    expect(SUMMARY.label).toBe('ハイライト');
    expect(shotConfigProblems({ ...cfg({ section: 'quest' }), label: ' ' }, ['quest'], () => []).join()).toContain('summary.label');
  });
  it('誤りを見つける', () => {
    const ids = ['quest', 'campaign', 'gacha'];
    const names = (s: string) => groupDefs(s).map((g) => g.name);
    expect(shotConfigProblems(cfg(), ids, names)).toHaveLength(1);
    expect(shotConfigProblems(cfg({ section: 'nope' }), ids, names).join()).toContain('nope');
    expect(shotConfigProblems(cfg({ section: 'campaign', groups: ['存在しない'] }), ids, names).join()).toContain('存在しない');
    expect(shotConfigProblems(cfg({ section: 'campaign', hide_keywords: [' '] }), ids, names).join()).toContain('空の語');
    expect(shotConfigProblems(cfg({ section: 'campaign', keywords: [] }), ids, names).join()).toContain('1つ以上');
    expect(shotConfigProblems(cfg({ section: 'quest', max_rows: 0 }), ids, names).join()).toContain('1以上');
    expect(shotConfigProblems(cfg({ section: 'quest', start_day_only: 'yes' as never }), ids, names).join()).toContain('true / false');
    expect(shotConfigProblems(cfg({ section: 'gacha', with_new_limited: 'yes' as never }), ids, names).join()).toContain('with_new_limited');
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
  it('小見出しの指定: 複数ならその順', () => {
    const two = summaryBlocks(
      ganttSections([ev('a#0', 'event', '期間限定クエスト あ', undefined, undefined, { group: '期間限定クエスト' }), ev('b#0', 'event', '黎絶 い降臨')], weekDays('2026-11-05')),
      grp,
      { blocks: [{ section: 'quest', groups: ['期間限定クエスト', '絶級クエスト'] }] },
    );
    expect(two[0]!.rows.map((r) => questGroup(r[0]!.event))).toEqual(['期間限定クエスト', '絶級クエスト']);
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
  it('概要の「開催日だけ」で縮めた長いバーには、開始時刻 `12:00開始` をバーの中に書く(期間そのままのバーには書かない)', () => {
    const long = ev('t#9', 'event', '期間限定クエスト z', '2026-11-06T12:00:00+09:00', '2026-11-12T11:59:00+09:00', { group: '期間限定クエスト' });
    const root = document.createElement('div');
    const state = initialState('2026-11-05', [...EVENTS, long], INDEX);
    state.shot = 'summary';
    render(root, state);
    // 設定の summary.blocks に期間限定クエストの開催日ブロックがあるので、縮めたバーに開始時刻が付く
    expect([...root.querySelectorAll('.bar-unlock')].map((x) => x.textContent)).toContain('12:00開始');
  });
  it('概要は、各セクションの大見出しの代わりに「ハイライト」の見出しを先頭に1つだけ出し、操作・詳細・注意書きも出さず、フッター(注記)も出さない', () => {
    const root = draw('summary');
    expect([...root.querySelectorAll('.g-section')].map((x) => x.textContent)).toEqual(['ハイライト']);
    expect(root.querySelector('.view-nav')).toBeNull();
    expect(root.querySelector('[data-testid="detail"]')).toBeNull();
    expect(root.querySelector('.site-footer')).toBeNull();
    expect(root.querySelector('.shot-note')).toBeNull();
    expect(root.textContent).not.toContain('非公式');
  });
});

describe('キャラクター・ガチャの画像と、概要の既定の絞り込み', () => {
  const chara = ev('k#c0', 'character', '桜（獣神化・改）', '2026-11-06T00:00:00+09:00', '2026-11-07T00:00:00+09:00', { character: { kind: '獣神化・改', at: '2026-11-06T12:00:00+09:00' } });
  const all = [
    ...EVENTS,
    chara,
    ev('j#0', 'event', '常設の何かクエスト', '2026-11-01T00:00:00+09:00', '2026-12-01T00:00:00+09:00', { group: '常設クエスト' }),
    ev('e#0', 'campaign', '特Lの園が出現!'),
    ev('e#1', 'campaign', 'スコア報酬5倍'),
  ];
  const draw2 = (shot: 'summary' | 'gacha') => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', all, INDEX);
    state.shot = shot;
    render(root, state);
    return root;
  };
  it('キャラクター・ガチャの単独画像は、そのセクションだけ。小見出し「進化」が先頭(日付ヘッダ・メンテの帯あり)', () => {
    const root = draw2('gacha');
    expect([...root.querySelectorAll<HTMLElement>('.g-section')].map((x) => `${x.dataset.section}:${x.textContent}`)).toEqual(['gacha:キャラクター・ガチャ']);
    expect([...root.querySelectorAll('.g-group')].map((x) => x.textContent)).toEqual(['進化', 'イベントガチャ']);
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
    expect(heads).toEqual([]); // 概要は小見出しを出さない
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

  it('その週に始まる長いものは、開始日の列1日分に縮め、矢印も付けず、開始時刻を書く', () => {
    const e = ev('t#0', 'event', '期間限定クエスト テスト', '2026-11-06T12:00:00+09:00', '2026-11-12T03:59:00+09:00', { group: '期間限定クエスト' });
    const b = f([e])[0]![0]!;
    expect([b.from, b.to, b.endFrac, b.clippedRight, b.openEnded]).toEqual([1, 1, 1, false, false]);
    expect(b.startFrac).toBe(0);
    expect(b.startLabel).toBe('12:00開始');
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
  it('startDayBars は時刻を捨てない: 翌日までに終わる1日限定は期間そのまま(12:00〜翌11:59)、長いものは開始日の列1日分+開始時刻の文字', () => {
    const one = ev('t#4', 'event', '滅絶 x', '2026-11-08T12:00:00+09:00', '2026-11-09T11:59:00+09:00', { group: '絶級クエスト' });
    const [b1] = startDayBars(rows([one])[0]!);
    expect([b1!.from, b1!.to, b1!.startFrac]).toEqual([3, 4, 0.5]);
    expect(b1!.endFrac).toBeCloseTo(11.983 / 24, 2);
    const long = ev('t#5', 'event', '期間限定クエスト y', '2026-11-08T12:00:00+09:00', '2026-11-12T11:59:00+09:00', { group: '期間限定クエスト' });
    const [b2] = startDayBars(rows([long])[0]!);
    expect([b2!.from, b2!.to, b2!.startFrac, b2!.endFrac, b2!.clippedRight, b2!.startLabel]).toEqual([3, 3, 0, 1, false, '12:00開始']);
    expect(b1!.startLabel).toBeUndefined();
  });
});

describe('キャラクター・ガチャ: 新限定のバーへの畳み込みと、進化の行', () => {
  const chara = (id: string, name: string, kind: '新限定' | '獣神化・改' | '真獣神化', start: string, end: string, extra: Partial<ExportEvent> = {}, character: Record<string, string> = {}): ExportEvent =>
    ev(id, 'character', name, start, end, { character: { kind, ...character }, ...extra });
  const D = (d: number) => `2026-11-${String(d).padStart(2, '0')}T00:00:00+09:00`;
  const S = '2026-11-07T12:00:00+09:00';
  const E = '2026-11-10T11:59:00+09:00';
  const host = ev('n#0', 'collab', 'ガチャ「彩・獣神祭」', S, E);
  const evs = [
    host,
    chara('n#c0', 'カーミラ（彩・獣神祭）', '新限定', S, E, { color: '#eb0043' }, { gacha: '彩・獣神祭' }),
    chara('n#c1', 'ツクモ（彩・獣神祭）', '新限定', S, E, { color: '#007d32' }, { gacha: '彩・獣神祭' }),
    chara('o#c0', 'ほか（グリーンファンタジー）', '新限定', '2026-11-08T12:00:00+09:00', E, {}, { gacha: 'グリーンファンタジー' }), // 同じ記事のガチャが無い → 行のまま
    chara('e#c0', 'A（獣神化・改）', '獣神化・改', D(9), D(10), { color: '#eb0043' }, { at: '2026-11-09T12:00:00+09:00' }),
    chara('e#c1', 'B（獣神化・改）', '獣神化・改', D(9), D(10), {}, { at: '2026-11-09T22:00:00+09:00' }),
    chara('e#c2', 'C（真獣神化）', '真獣神化', D(10), D(11), {}, { at: '2026-11-10T12:00:00+09:00' }),
  ];
  const rows = () => ganttSections(evs, weekDays('2026-11-05')).find((s) => s.section.id === 'gacha')!.rows;

  it('同じ記事・同じ開始・同じ終了のガチャに、新限定の名前・属性色・属性を畳む。畳んだキャラの行は無くなる', () => {
    const f = foldNewLimited(evs);
    expect(f.map((e) => e.id)).toEqual(['n#0', 'o#c0', 'e#c0', 'e#c1', 'e#c2']);
    expect(f[0]!.new_names).toEqual([{ name: 'カーミラ', color: '#eb0043', attr: '火' }, { name: 'ツクモ', color: '#007d32', attr: '木' }]);
    expect(f[1]!.new_names).toBeUndefined();
  });
  it('期間が違う・記事が違うときは畳まない(キャラの行を失わない)', () => {
    const other = [host, chara('n#c0', 'X（彩・獣神祭）', '新限定', S, '2026-11-11T11:59:00+09:00', {}, { gacha: '彩・獣神祭' }), chara('z#c0', 'Y（彩・獣神祭）', '新限定', S, E)];
    expect(foldNewLimited(other).map((e) => e.id)).toEqual(['n#0', 'n#c0', 'z#c0']);
    expect(foldNewLimited(other)[0]!.new_names).toBeUndefined();
  });
  it('小見出しの順は 進化 → イベントガチャ → 期間限定ガチャ(畳めなかった新限定)', () => {
    const r = rows();
    expect(r.map((x) => gachaGroup(x[0]!.event))).toEqual(['進化', '進化', '進化', 'イベントガチャ', '期間限定ガチャ']);
    expect(r[3]![0]!.event.new_names?.map((n) => n.name)).toEqual(['カーミラ', 'ツクモ']);
  });
  const draw = (shot?: 'gacha' | 'summary') => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', evs, INDEX);
    if (shot) state.shot = shot;
    render(root, state);
    return root;
  };
  it('通常表示: ガチャのバーの中に新限定の名前(属性色)が出る。ツールチップにも出る。進化と畳めなかった新限定は1キャラ1行', () => {
    const root = draw();
    const bar = [...root.querySelectorAll<HTMLElement>('.bar-ev')].find((b) => b.dataset.eventId === 'n#0')!;
    expect(bar.querySelector('.bar-names')?.textContent).toBe('NEW！カーミラ・ツクモ');
    expect(bar.querySelectorAll('.g-name.colored')).toHaveLength(2); // 2人以上: 名前だけが属性色(「NEW！」と「・」は既定の色)
    expect(bar.querySelector('.bar-new-label')?.textContent).toBe('NEW！');
    expect(bar.querySelector('.bar-new-label.colored')).toBeNull();
    expect(bar.title).toContain('新限定: カーミラ(火)・ツクモ(木)');
    expect(bar.classList.contains('has-names')).toBe(true);
    expect(root.querySelectorAll('.bar-names')).toHaveLength(1);
    expect(root.querySelectorAll('.g-row:not(.g-dates) > .g-label')).toHaveLength(6); // A・B・C(進化)+ガチャ+ほか+クエストのイベントガチャの写し
    expect([...root.querySelectorAll('.g-group')].map((x) => x.textContent)).toEqual(['イベントクエスト', '進化', 'イベントガチャ', '期間限定ガチャ']);
    expect(root.querySelector('.g-section[data-section="gacha"]')?.textContent).toBe('キャラクター・ガチャ');
  });
  it('月表示: バーには短く「NEW」だけ(名前は書かない)。名前はツールチップと詳細パネル', () => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', evs, INDEX);
    state.view = 'month';
    render(root, state);
    const bar = [...root.querySelectorAll<HTMLElement>('.bar-ev')].find((b) => b.dataset.eventId === 'n#0')!;
    expect(bar.querySelector('.bar-new')?.textContent).toBe('NEW');
    expect(bar.querySelector('.bar-names')).toBeNull();
    expect(bar.textContent).toBe('NEW');
    expect(bar.title).toContain('カーミラ(火)');
    state.selection = { day: '2026-11-08', eventId: 'n#0' };
    render(root, state);
    expect(root.querySelector('[data-testid="detail"]')?.textContent).toContain('新限定キャラクター: カーミラ(火)、ツクモ(木)');
  });
  it('詳細パネル: ガチャの項目に新限定キャラクター(名前と属性)が出る。キャラ自身の項目は別に出ない', () => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', evs, INDEX);
    state.selection = { day: '2026-11-08', eventId: 'n#0' };
    render(root, state);
    const detail = root.querySelector('[data-testid="detail"]')!;
    expect(detail.textContent).toContain('新限定キャラクター: カーミラ(火)、ツクモ(木)');
    // 名前(属性)は属性色
    const spans = [...detail.querySelectorAll<HTMLElement>('.detail-note .qname')];
    expect(spans.map((x) => [x.textContent, x.style.getPropertyValue('--pc')])).toEqual([['カーミラ(火)', '#eb0043'], ['ツクモ(木)', '#007d32']]);
    state.selection = { day: '2026-11-08' };
    render(root, state);
    const items = [...root.querySelectorAll('[data-testid="detail"] .detail-item h3')].map((x) => x.textContent);
    expect(items.some((t) => t?.includes('カーミラ'))).toBe(false);
    expect(items.some((t) => t?.includes('彩・獣神祭'))).toBe(true);
  });
  it('撮影モード(キャラクター・ガチャ): 通常のカレンダーと同じ描き方(進化は1キャラ1行でバーあり)。新限定はガチャのバーの中', () => {
    const root = draw('gacha');
    const labels = [...root.querySelectorAll('.g-row:not(.g-dates) > .g-label')].map((x) => x.textContent);
    expect(labels).toEqual(['A（獣神化・改）', 'B（獣神化・改）', 'C（真獣神化）', expect.stringContaining('彩・獣神祭'), expect.stringContaining('ほか')]);
    expect(root.querySelectorAll('.g-chips')).toHaveLength(0);
    expect(root.querySelector('.bar-names')?.textContent).toBe('NEW！カーミラ・ツクモ');
  });
  it('概要: 新限定(with_new_limited)のブロックは、名前を持つガチャの行だけ。ほかのブロックには出さない', () => {
    const secs = ganttSections(evs, weekDays('2026-11-05'));
    const out = summaryBlocks(secs, grp, { blocks: [{ section: 'gacha', groups: ['イベントガチャ'] }, { section: 'gacha', with_new_limited: true }, { section: 'gacha', groups: ['進化'] }] });
    // イベントガチャのブロックは、新限定の名前を持つ行を出さない(行が無いのでブロックごと出ない)。新限定のブロックだけに出る。進化は1キャラ1行
    expect(out.map((e) => e.rows.flatMap((r) => r.map((b) => b.event.name)))).toEqual([['ガチャ「彩・獣神祭」'], ['A（獣神化・改）', 'B（獣神化・改）', 'C（真獣神化）']]);
  });
});

describe('バーの縁の属性色(新限定・ピックアップ・進化)', () => {
  const S = '2026-11-07T12:00:00+09:00';
  const E = '2026-11-10T11:59:00+09:00';
  const chara = (id: string, name: string, color?: string): ExportEvent => ev(id, 'character', name, S, E, { character: { kind: '新限定' }, ...(color ? { color } : {}) });
  const bars = (events: ExportEvent[], month = false): Record<string, HTMLElement> => {
    const root = document.createElement('div');
    const state = initialState('2026-11-05', events, INDEX);
    if (month) state.view = 'month';
    render(root, state);
    return Object.fromEntries([...root.querySelectorAll<HTMLElement>('.bar-ev')].map((b) => [b.dataset.eventId as string, b]));
  };
  const host = ev('n#0', 'collab', 'ガチャ「彩・獣神祭」', S, E);

  it('新限定が1人: 縁がその属性色(edge-attr・--pc)。面は変えない', () => {
    const b = bars([host, chara('n#c0', 'A（彩・獣神祭）', '#eb0043')])['n#0']!;
    expect(b.classList.contains('edge-attr')).toBe(true);
    expect(b.style.getPropertyValue('--pc')).toBe('#eb0043');
    expect(b.classList.contains('edge-split')).toBe(false);
  });
  it('新限定が2人: 縁を左右半分ずつ(edge-split。左=最初の名前の色)', () => {
    const b = bars([host, chara('n#c0', 'A（彩・獣神祭）', '#eb0043'), chara('n#c1', 'B（彩・獣神祭）', '#007d32')])['n#0']!;
    expect(b.classList.contains('edge-split')).toBe(true);
    expect(b.style.getPropertyValue('--pc1')).toBe('#eb0043');
    expect(b.style.getPropertyValue('--pc2')).toBe('#007d32');
    expect(b.classList.contains('edge-attr')).toBe(false);
  });
  it('新限定が3人以上・色が分からない人がいる: 既定の縁のまま(分割しない)', () => {
    const three = bars([host, chara('n#c0', 'A（彩・獣神祭）', '#eb0043'), chara('n#c1', 'B（彩・獣神祭）', '#007d32'), chara('n#c2', 'C（彩・獣神祭）', '#3154ef')])['n#0']!;
    expect([three.classList.contains('edge-attr'), three.classList.contains('edge-split')]).toEqual([false, false]);
    const unknown = bars([host, chara('n#c0', 'A（彩・獣神祭）', '#eb0043'), chara('n#c1', 'B（彩・獣神祭）')])['n#0']!;
    expect([unknown.classList.contains('edge-attr'), unknown.classList.contains('edge-split')]).toEqual([false, false]);
    const none = bars([host, chara('n#c0', 'A（彩・獣神祭）')])['n#0']!;
    expect(none.classList.contains('edge-attr')).toBe(false);
  });
  it('ピックアップのバー: 名前の色(pickup.color)が縁。色が無ければ既定', () => {
    const p1 = ev('p#1', 'collab', 'ガチャ「作品｜ユル」', S, E, { pickup: { name: 'ユル', order: 0, color: '#3154ef', mainId: 'p#0' } });
    const p2 = ev('p#2', 'collab', 'ガチャ「作品｜ミナ」', S, E, { pickup: { name: 'ミナ', order: 1, mainId: 'p#0' } });
    const b = bars([ev('p#0', 'collab', 'ガチャ「作品」', S, E), p1, p2]);
    expect(b['p#1']!.classList.contains('edge-attr')).toBe(true);
    expect(b['p#1']!.style.getPropertyValue('--pc')).toBe('#3154ef');
    expect(b['p#2']!.classList.contains('edge-attr')).toBe(false);
  });
  it('進化のバー(キャラクターの項目): 属性色が縁。色が無ければ既定', () => {
    const e1 = ev('e#c0', 'character', 'A（獣神化・改）', '2026-11-09T00:00:00+09:00', '2026-11-10T00:00:00+09:00', { character: { kind: '獣神化・改', at: '2026-11-09T12:00:00+09:00' }, color: '#a237c3' });
    const e2 = ev('e#c1', 'character', 'B（獣神化・改）', '2026-11-09T00:00:00+09:00', '2026-11-10T00:00:00+09:00', { character: { kind: '獣神化・改', at: '2026-11-09T13:00:00+09:00' } });
    const b = bars([e1, e2]);
    expect(b['e#c0']!.classList.contains('edge-attr')).toBe(true);
    expect(b['e#c0']!.style.getPropertyValue('--pc')).toBe('#a237c3');
    expect(b['e#c1']!.classList.contains('edge-attr')).toBe(false);
  });
  it('バー内の文字: 週表示は「NEW！名前」(2人は「・」区切り。1人なら「NEW！」も属性色)、月表示は「NEW」だけ(1人なら属性色。中央揃えはCSS)', () => {
    const one = [host, chara('n#c0', 'マクスウェル（彩・獣神祭）', '#a237c3')];
    expect(bars(one)['n#0']!.querySelector('.bar-names')?.textContent).toBe('NEW！マクスウェル');
    expect(bars(one)['n#0']!.querySelector('.bar-new-label.colored')).not.toBeNull(); // 1人: 「NEW！」も属性色
    expect((bars(one, true)['n#0']!.querySelector('.bar-new') as HTMLElement).classList.contains('colored')).toBe(true);
    const two = [host, chara('n#c0', 'A（彩・獣神祭）', '#eb0043'), chara('n#c1', 'B（彩・獣神祭）', '#007d32')];
    expect(bars(two)['n#0']!.querySelector('.bar-names')?.textContent).toBe('NEW！A・B');
    const m = bars(two, true)['n#0']!;
    expect(m.textContent).toBe('NEW');
    expect(m.querySelector('.bar-names')).toBeNull();
  });
});

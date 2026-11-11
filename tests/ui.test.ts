// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportEvent, IndexFile } from '../src/data/export';
import { dragShift, initialState, render, type AppState } from '../src/ui';
import { periodText, rowLabel, addDays, addMonthsToDay, monthWindow, barSpan, campaignGroup, campaignRank, questGroup, eventsForDay, formatJst, ganttSections, mergeEvents, maintenanceBars, maintenanceOnDay, isOnCalendarDay, mergeSameLabel, monthDays, addMonths, slotRows, weekDays } from '../src/week';
import { gachaGroup, sectionOf, sectionOfEvent } from '../src/sections';
import { applySelection } from '../src/selection';
import { MONTHLY, monthlyDays, monthlyEvents } from '../src/monthly';
import { RECURRING_KEYWORDS, fullLabel, labelLines, recurringKeyword, shortLabel, superUltimateLabel } from '../src/label';

const ev = (id: string, category: string, start: string, end: string | null, extra: Partial<ExportEvent> = {}): ExportEvent => ({
  id,
  article_id: id.split('#')[0] as string,
  name: `name-${id}`,
  title: `title-${id}`,
  category,
  start,
  end,
  reward_until: null,
  url: `https://example.test/${id}`,
  ...extra,
});

const EVENTS = [
  ev('a#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T11:59:00+09:00', { reward_until: '2026-11-01T03:59:00+09:00' }),
  ev('b#0', 'campaign', '2026-10-27T04:00:00+09:00', '2026-10-27T23:59:00+09:00'),
  ev('c#0', 'event', '2026-10-28T10:00:00+09:00', null),
  ev('far#0', 'event', '2026-12-01T00:00:00+09:00', '2026-12-02T00:00:00+09:00'),
];
const INDEX: IndexFile = { generated_at: '2026-10-27T09:00:00+09:00', collected_at: '2026-10-26T18:00:00+09:00', months: ['2026-10'], categories: ['campaign', 'event'] };

let root: HTMLElement;
let state: AppState;
const cols = () => [...root.querySelectorAll<HTMLElement>('.day')];
const col = (day: string) => root.querySelector<HTMLElement>(`.day[data-day="${day}"]`) as HTMLElement;
const bars = () => [...root.querySelectorAll<HTMLElement>('.bar-ev')];
const bar = (id: string) => root.querySelector<HTMLElement>(`.bar-ev[data-event-id="${id}"]`) as HTMLElement;
const span = (id: string) => bar(id).style.gridColumn.replace(/\s/g, '');
const sections = () => [...root.querySelectorAll<HTMLElement>('.g-section')].map((e) => e.dataset.section);
const click = (e: Element | null) => (e as HTMLElement).click();
const q = (id: string) => root.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app') as HTMLElement;
  state = initialState('2026-10-27', EVENTS, INDEX);
  render(root, state);
});

describe('week logic', () => {
  it('7 consecutive days from the start', () => {
    expect(weekDays('2026-10-27')).toEqual(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(addDays('2026-10-27', 7)).toBe('2026-11-03');
  });
  it('formats JST regardless of offset in input', () => {
    expect(formatJst('2026-10-27T03:00:00Z')).toBe('10/27(火) 12:00');
  });
  it('sorts by start time and marks continuation', () => {
    const r = eventsForDay(EVENTS, '2026-10-28');
    expect(r.map((x) => [x.event.id, x.continued, x.openEnded])).toEqual([['a#0', true, false], ['c#0', false, true]]);
  });
});

describe('gantt week view', () => {
  it('renders 7 date headers starting today with sat/sun marks', () => {
    expect(cols()).toHaveLength(7);
    expect(cols()[0]?.dataset.day).toBe('2026-10-27');
    expect(cols()[0]?.textContent).toBe('27火');
    expect(cols()[0]?.classList.contains('today')).toBe(true);
    expect(col('2026-10-31').classList.contains('sat')).toBe(true);
    expect(col('2026-11-01').classList.contains('sun')).toBe(true);
  });

  it('groups rows by section in config order and places bars on the right columns', () => {
    expect(sections()).toEqual(['quest', 'campaign']);
    // 列は日付列が2から。a: 10/27 12:00〜10/29 11:59 → 列2〜4
    expect(span('a#0')).toBe('2/5');
    expect(span('b#0')).toBe('2/3');
    // open-ended: 開始日のみ
    expect(span('c#0')).toBe('3/4');
    expect(bar('c#0').classList.contains('open')).toBe(true);
    expect(bar('c#0').getAttribute('aria-label')).toContain('終了未定');
    expect(bar('far#0')).toBeNull();
    expect(bars().map((b) => b.dataset.eventId)).toEqual(['a#0', 'c#0', 'b#0']);
  });

  it('bar click opens detail with period, reward deadline and link', () => {
    click(bar('a#0'));
    const d = q('detail')?.textContent ?? '';
    expect(d).toContain('name-a#0');
    expect(d).not.toContain('title-a#0');
    expect(d).toContain('10/27(火) 12:00 〜 10/29(木) 11:59');
    expect(d).not.toContain('報酬受取期限'); // 表示しない
    expect(q('detail')?.querySelector('a')?.getAttribute('href')).toBe('https://example.test/a#0');
    expect(q('detail')?.textContent).not.toContain('name-b#0');
    expect(q('detail-close')?.textContent).toBe('×');
    expect(q('detail-close')?.getAttribute('aria-label')).toBe('閉じる');
    click(q('detail-close'));
    expect(q('detail')?.textContent).toBe('');
  });

  it('date header click lists all events of that day', () => {
    click(col('2026-10-27'));
    const d = q('detail')?.textContent ?? '';
    expect(d).toContain('name-a#0');
    expect(d).toContain('name-b#0');
  });

  it('has no checkboxes (selection is done by file)', () => {
    expect(root.querySelector('input')).toBeNull();
  });

  it('日付は MM/DD に0埋めして表示する(期間・日付見出し)。名称中の数値は変えない', () => {
    const e = ev('pad#0', 'event', '2026-11-03T12:00:00+09:00', '2026-11-09T11:59:00+09:00', { name: '「1/2」のクエスト' });
    state.events = [e];
    state.weekStart = '2026-11-02';
    render(root, state);
    click(bar('pad#0'));
    const d = q('detail')?.textContent ?? '';
    expect(d).toContain('11/03(火) 12:00 〜 11/09(月) 11:59');
    expect(d).toContain('1/2');
    expect(d).not.toContain('01/02');
  });

  it('コラボのガチャ開催スケジュールを表(対象・期間)で詳細に出す。対象の繰り返しは空欄', () => {
    const g = ev('sch#0', 'collab', '2026-11-03T12:00:00+09:00', '2026-11-09T11:59:00+09:00', {
      name: 'ガチャ「サンプル」開催!',
      details: [{ label: 'ガチャ開催スケジュール', lines: ['Aピックアップ | 11/3 12:00〜11/4 11:59', 'Aピックアップ | 11/6 12:00〜11/7 11:59'] }],
    });
    state.events = [g];
    state.weekStart = '2026-11-02';
    render(root, state);
    click(bar('sch#0'));
    const rows = [...(q('detail')?.querySelectorAll('.detail-block tbody tr') ?? [])].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
    // 対象は縦結合(rowspan)。2行目は期間のセルだけ
    expect(rows).toEqual([['Aピックアップ', '11/03 12:00〜11/04 11:59'], ['11/06 12:00〜11/07 11:59']]);
    expect(q('detail')?.querySelector('.sched-name')?.getAttribute('rowspan')).toBe('2');
    expect([...(q('detail')?.querySelectorAll('.detail-block th') ?? [])].map((c) => c.textContent)).toEqual(['対象', '期間']);
  });

  it('対象キャラクターの表(キャラクター・レアリティ・属性)を詳細に出す', () => {
    const g = ev('chr#0', 'event', '2026-11-03T12:00:00+09:00', '2026-11-05T11:59:00+09:00', {
      name: 'ガチャ「サンプル星歌」開催！',
      details: [{ label: '対象キャラクター', lines: ['アルファ | ★6（獣神化前） | 火', 'ベータ | ★5 | 水'] }],
    });
    state.events = [g];
    state.weekStart = '2026-11-02';
    render(root, state);
    click(bar('chr#0'));
    expect([...(q('detail')?.querySelectorAll('.detail-block th') ?? [])].map((c) => c.textContent)).toEqual(['キャラクター', 'レアリティ', '属性']);
    expect([...(q('detail')?.querySelectorAll('.detail-block tbody tr') ?? [])].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent))).toEqual([['アルファ', '★6（獣神化前）', '火'], ['ベータ', '★5', '水']]);
  });

  it('shows the last collection time in JST (not the generation time)', () => {
    expect(q('collected-at')?.textContent).toContain('最終更新: 10/26(月) 18:00');
  });

  it('footer: 自動収集の注意書きを出し、リポジトリURLが無ければIssueリンクは出さない', () => {
    const f = q('footer');
    expect(f?.textContent).toContain('誤りや抜け');
    expect(f?.textContent).toContain('非公式');
    expect(f?.querySelector('a')).toBeNull();
  });

  it('footer: VITE_REPO_URL があればIssue作成ページへ外部リンクする', () => {
    vi.stubEnv('VITE_REPO_URL', 'https://github.com/o/r/');
    render(root, state);
    const a = q('footer')?.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://github.com/o/r/issues/new/choose');
    expect(a?.getAttribute('rel')).toContain('noopener');
    vi.unstubAllEnvs();
  });

  it('clips bars at week edges', () => {
    const days = weekDays('2026-10-28');
    const e = ev('w#0', 'event', '2026-10-20T12:00:00+09:00', '2026-11-20T12:00:00+09:00');
    const s = barSpan(e, days);
    expect(s).toMatchObject({ from: 0, to: 6, clippedLeft: true, clippedRight: true });
    expect(barSpan(EVENTS[3] as ExportEvent, days)).toBeNull();
  });

  it('bar span: 列は暦日(JST)。終了が丁度0:00なら前日の列まで', () => {
    const days = weekDays('2026-10-27');
    expect(barSpan(ev('x#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-28T00:00:00+09:00'), days)).toMatchObject({ from: 0, to: 0 });
    expect(barSpan(ev('y#0', 'event', '2026-10-28T03:59:00+09:00', '2026-10-28T10:00:00+09:00'), days)).toMatchObject({ from: 1, to: 1 });
    expect(barSpan(ev('z#0', 'event', '2026-10-26T12:00:00+09:00', '2026-10-26T23:59:00+09:00'), days)).toBeNull();
  });

  it('excluded categories and empty sections are not shown', () => {
    const r = ganttSections([ev('u#0', 'update', '2026-10-27T12:00:00+09:00', '2026-10-28T12:00:00+09:00')], weekDays('2026-10-27'));
    expect(r).toEqual([]);
    expect(sectionOf('update')).toBeNull();
    expect(sectionOf('event')?.id).toBe('quest');
    expect(sectionOf('something-new')).toBeNull();
  });
});

describe('game-day boundaries and misc', () => {
  const on = (e: ExportEvent, day: string) => eventsForDay([e], day).length === 1;
  it('event ending exactly at 04:00 does not show on the next day', () => {
    const e = ev('x#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-28T04:00:00+09:00');
    expect(on(e, '2026-10-27')).toBe(true);
    expect(on(e, '2026-10-28')).toBe(false);
  });
  it('event ending 03:59 shows only up to the previous game day; 02:00 start belongs to the previous day', () => {
    const e = ev('y#0', 'event', '2026-10-28T02:00:00+09:00', '2026-10-28T03:59:00+09:00');
    expect(on(e, '2026-10-27')).toBe(true);
    expect(on(e, '2026-10-28')).toBe(false);
  });
  it('open-ended detail shows 終了未定', () => {
    click(bar('c#0'));
    expect(q('detail')?.textContent).toContain('終了未定');
  });
  it('mergeEvents dedupes events spanning two month files', () => {
    expect(mergeEvents([[EVENTS[0] as ExportEvent], [EVENTS[0] as ExportEvent, EVENTS[1] as ExportEvent]])).toHaveLength(2);
  });
});

describe('今日から7日のみ', () => {
  it('前週/次週/今日ボタンとタブが無く、日付ヘッダは今日から7日', () => {
    expect(q('prev')).toBeNull();
    expect(q('next')).toBeNull();
    expect(q('today')).toBeNull();
    expect(q('tab-population')).toBeNull();
    expect(cols().map((c) => c.dataset.day)).toEqual(weekDays('2026-10-27'));
    expect(bar('far#0')).toBeNull();
  });
});

describe('選択ファイルの反映(main.tsと同じ合成)', () => {
  const draw = (sel: { generated_at: string; selected: string[]; total: number } | null) => {
    const evs = [ev('a#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T11:59:00+09:00', { item: 'A' }), ev('b#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T11:59:00+09:00', { item: 'B' })];
    render(root, initialState('2026-10-27', applySelection(evs, sel), INDEX));
    return bars().map((b) => b.dataset.eventId);
  };
  it('選択ファイル無しなら全件、有りなら選択済みのみ', () => {
    expect(draw(null)).toEqual(['a#0', 'b#0']);
    expect(draw({ generated_at: '', selected: ['B'], total: 2 })).toEqual(['b#0']);
  });
});

describe('ラベル短縮', () => {
  const NAMES: Array<[string, string]> = [
    ['「絶級トーナメント」が10/26 12時より期間限定で登場！ #1', '絶級トーナメント'],
    ['「禁忌の獄」「禁忌の獄〜深淵〜」が10/21 12時より期間限定で登場！ #1', '禁忌の獄'],
    ['「覇者の塔シーズンズ」開催!', '覇者の塔'],
    ['期間限定イベント「未開の幻洞」が10/14より登場！ #1', '未開の幻洞'],
    ['破界の星墓 みんなで突破チャレンジ', '破界の星墓'],
    ['超究極クエスト（大黒天）が10/9 19時より期間限定で登場！クリアで獣神化が解放！ #1', '超究極クエスト（大黒天）'],
    ['超究極・兵クエスト（ミザリー）が10/30より期間限定で出現！ #1', '超究極・兵クエスト（ミザリー）'],
    ['ガチャ「RED STARS」10/23より開催！ #1', 'ガチャ「RED STARS」'],
    ['みんなの銀行の期間限定キャンペーンを10/15より開催！ #1', 'みんなの銀行の期間限定キャンペーン'],
    ['「夜と昼を別つ双子ミッション」開催!(追記:10/22)', '「夜と昼を別つ双子ミッション」'],
    ['【13周年感謝キャンペーン】「よりどりガチャマーケット」が開催！', '「よりどりガチャマーケット」'],
    ['★6確定ガチャ玉について', '★6確定ガチャ玉'],
    ['遊び方', '遊び方'],
    ['≪モンスポット≫「学びのパワー」の出現確率がアップ!', '≪モンスポット≫「学びのパワー」の出現確率がアップ'],
    ['登場', '登場'],
    ['「守護獣の森」の究極難易度でスコア報酬に「5倍」のスペシャルボーナス!', '「守護獣の森」の究極難易度でスコア報酬に「5倍」のスペシャルボーナス'],
  ];
  it.each(NAMES)('%s -> %s', (name, want) => {
    expect(shortLabel(name)).toBe(want);
  });
  it('keywords are injectable and the first match wins', () => {
    expect(shortLabel('新「テスト塔」開催!', ['テスト塔'])).toBe('テスト塔');
    expect(recurringKeyword('なし', ['x'])).toBeNull();
  });
  it('config keywords are the five regulars', () => {
    expect(RECURRING_KEYWORDS).toEqual(['覇者の塔', '絶級トーナメント', '未開の幻洞', '禁忌の獄', '破界の星墓']);
  });
  it('gantt label and detail use the short label; full name stays in tooltip; no category/title lines', () => {
    const e = ev('r#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T11:59:00+09:00', { name: '「絶級トーナメント」が10/26 12時より期間限定で登場！ #1', title: '長い記事タイトル' });
    render(root, initialState('2026-10-27', [e], INDEX));
    expect(root.querySelector('.g-l1')?.textContent).toBe('絶級トーナメント');
    expect(bar('r#0').title).toContain('が10/26 12時より期間限定で登場！');
    click(bar('r#0'));
    const d = q('detail')?.textContent ?? '';
    expect(d).toContain('絶級トーナメント');
    expect(d).not.toContain('長い記事タイトル');
    expect(d).not.toContain('登場');
  });
});

describe('same-label merge and ultimate ordering', () => {
  const days = weekDays('2026-10-27');
  const named = (id: string, name: string, start: string, end: string | null, category = 'event') => ev(id, category, start, end, { name });

  it('merges same label with overlapping periods into the union', () => {
    const a = named('a#0', '「覇者の塔」が登場', '2026-10-07T12:00:00+09:00', '2026-10-28T11:59:00+09:00');
    const b = named('b#0', '覇者の塔について', '2026-10-20T12:00:00+09:00', '2026-10-30T11:59:00+09:00');
    const r = ganttSections([b, a], days);
    expect(r).toHaveLength(1);
    expect(r[0]?.bars).toHaveLength(1);
    expect(r[0]?.bars[0]?.event).toMatchObject({ id: 'a#0', start: '2026-10-07T12:00:00+09:00', end: '2026-10-30T11:59:00+09:00' });
  });

  it('keeps separate rows when periods are apart, and open end wins', () => {
    const a = named('a#0', '絶級トーナメント', '2026-10-27T12:00:00+09:00', '2026-10-28T11:59:00+09:00');
    const b = named('b#0', '絶級トーナメント', '2026-10-30T12:00:00+09:00', '2026-10-31T11:59:00+09:00');
    expect(ganttSections([a, b], days)[0]?.bars).toHaveLength(2);
    const c = named('c#0', '絶級トーナメント', '2026-10-28T00:00:00+09:00', null);
    const m = ganttSections([a, c], days)[0]?.bars;
    expect(m).toHaveLength(1);
    expect(m?.[0]?.event.end).toBeNull();
  });

  it('does not merge across sections or different labels', () => {
    const a = named('a#0', '禁忌の獄', '2026-10-27T12:00:00+09:00', '2026-10-28T11:59:00+09:00');
    const b = named('b#0', '禁忌の獄', '2026-10-27T12:00:00+09:00', '2026-10-28T11:59:00+09:00', 'campaign');
    const c = named('c#0', '未開の幻洞', '2026-10-27T12:00:00+09:00', '2026-10-28T11:59:00+09:00');
    expect(ganttSections([a, b, c], days).flatMap((g) => g.bars)).toHaveLength(3);
  });

  it('puts ultimate quests at the bottom of the quest section only', () => {
    const u = named('u#0', '超究極クエスト（大黒天）', '2026-10-27T01:00:00+09:00', '2026-11-05T11:59:00+09:00');
    const u2 = named('u#1', '超究極・兵クエスト', '2026-10-27T02:00:00+09:00', '2026-11-05T11:59:00+09:00');
    const n = named('n#0', '未開の幻洞', '2026-10-28T12:00:00+09:00', '2026-10-29T11:59:00+09:00');
    const camp = named('k#0', '超究極キャンペーン', '2026-10-27T01:00:00+09:00', '2026-10-29T11:59:00+09:00', 'campaign');
    const r = ganttSections([u, u2, n, camp], days);
    expect(r.find((g) => g.section.id === 'quest')?.bars.map((b) => b.event.id)).toEqual(['n#0', 'u#1', 'u#0']); // キャラ名なしの超究極は補足なし扱いで先頭
    expect(r.find((g) => g.section.id === 'campaign')?.bars).toHaveLength(1);
  });

  it('chains overlaps, merges touching ends, and takes the latest reward_until', () => {
    const a = ev('a#0', 'event', '2026-10-27T00:00:00+09:00', '2026-10-28T00:00:00+09:00', { name: '禁忌の獄', reward_until: '2026-11-01T00:00:00+09:00' });
    const b = ev('b#0', 'event', '2026-10-28T00:00:00+09:00', '2026-10-29T00:00:00+09:00', { name: '禁忌の獄' });
    const c = ev('c#0', 'event', '2026-10-28T12:00:00+09:00', '2026-10-30T00:00:00+09:00', { name: '禁忌の獄', reward_until: '2026-11-03T00:00:00+09:00' });
    const m = mergeSameLabel([c, a, b]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id: 'a#0', end: '2026-10-30T00:00:00+09:00', reward_until: '2026-11-03T00:00:00+09:00' });
  });

  it('passes excluded categories through untouched', () => {
    const u = ev('u#0', 'update', '2026-10-27T12:00:00+09:00', '2026-10-28T12:00:00+09:00');
    expect(mergeSameLabel([u])).toEqual([u]);
  });
});

describe('2行表示と並び順', () => {
  const days = weekDays('2026-10-27');
  const L = (n: string) => {
    const r = labelLines(n);
    return [r.title, r.desc];
  };
  it('超究極の（）を2行目へ', () => {
    expect(L('超究極クエスト（大黒天）が10/9 19時より期間限定で登場！クリアで獣神化が解放！ #1')).toEqual(['超究極クエスト', '（大黒天）']);
    expect(L('超究極・兵クエスト（ミザリー）が10/30より期間限定で出現！ #1')).toEqual(['超究極・兵クエスト', '（ミザリー）']);
  });
  it('対象(先頭の括弧/並び順キーワード)を1行目、説明を2行目へ', () => {
    expect(L('「追憶の書庫」のクエストで金卵の排出率が「2倍」!')).toEqual(['追憶の書庫', 'クエストで金卵の排出率が2倍']);
    expect(L('≪モンスポット≫「学びのパワー」の出現確率がアップ!')).toEqual(['モンスポット', '学びのパワーの出現確率がアップ']);
    expect(L('英雄の神殿の「ノーコンテニュー報酬」でわくわくの実が2個排出!')).toEqual(['英雄の神殿', 'ノーコンテニュー報酬でわくわくの実が2個排出']);
  });
  it('分割できなければ1行目のみ・定例はキーワードのみ', () => {
    expect(L('遊び方')).toEqual(['遊び方', null]);
    expect(L('ガチャ「RED STARS」10/23より開催！ #1')).toEqual(['ガチャRED STARS', null]);
    expect(L('【13周年感謝キャンペーン】「よりどりガチャマーケット」が開催！')).toEqual(['よりどりガチャマーケット', null]);
    expect(L('「禁忌の獄」「禁忌の獄〜深淵〜」が登場')).toEqual(['禁忌の獄', null]);
  });
  it('半角括弧・空白・途中括弧', () => {
    expect(L('超究極クエスト (大黒天)')).toEqual(['超究極クエスト', '(大黒天)']);
    expect(L('途中（括弧）のある項目')).toEqual(['途中（括弧）のある項目', null]);
    expect(L('『X』を開催')).toEqual(['X', null]);
  });
  it('長い説明も省略(…)しない', () => {
    const r = labelLines('「X」の' + 'あ'.repeat(60));
    expect([...(r.desc ?? '')]).toHaveLength(60);
    expect(r.desc).not.toContain('…');
  });
  it('キャンペーンは設定順→その他(末尾)、同順位は開始順', () => {
    const c = (id: string, name: string, h: number) => ev(id, 'campaign', `2026-10-27T0${h}:00:00+09:00`, '2026-10-28T11:00:00+09:00', { name });
    const r = ganttSections(
      [c('o#0', 'その他の何か', 1), c('m#0', '≪モンスポット≫x', 2), c('h#0', '英雄の神殿の報酬', 3), c('h#1', '英雄の神殿の別', 2), c('n#0', '「ノーマルクエスト」x', 4), c('k#0', '「追憶の書庫」x', 5), c('s#0', '「守護獣の森」x', 6)],
      days,
    );
    expect(r[0]?.bars.map((b) => b.event.id)).toEqual(['n#0', 'h#1', 'h#0', 'k#0', 's#0', 'm#0', 'o#0']);
    expect(campaignRank(ev('z#0', 'campaign', '2026-10-27T00:00:00+09:00', null, { name: 'zzz' }), ['a'])).toBe(1);
  });
  it('左ラベルに2行(対象/説明)、バーにはテキストを書かない', () => {
    const u = ev('u#0', 'event', '2026-10-30T12:00:00+09:00', '2026-11-02T11:00:00+09:00', { name: '超究極クエスト（大黒天）が登場！' });
    const one = ev('d#0', 'event', '2026-10-27T12:00:00+09:00', null, { name: '「追憶の書庫」で金卵2倍!' });
    render(root, initialState('2026-10-27', [u, one], INDEX));
    const labels = [...root.querySelectorAll('.g-row .g-label')].filter((l) => l.querySelector('.g-l1'));
    expect(labels.map((l) => [l.querySelector('.g-l1')?.textContent, l.querySelector('.g-l2')?.textContent ?? null])).toEqual([
      ['大黒天', null], // 超究極はキャラ名のみ(補足が無ければ括弧ごと省く)
      ['金卵2倍', null], // eventでもキャンペーンセクション。小見出し「追憶の書庫」配下は説明のみ
    ]);
    expect(bars().every((b) => b.textContent === '')).toBe(true);
    expect(root.querySelectorAll('.g-row').length).toBe(3);
  });
  it('スクロールバー出入りによる横ずれ防止(scrollbar-gutter)がCSSにある', () => {
    const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8');
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
    expect(css).toMatch(/html\s*\{[^}]*overflow-y:\s*scroll/);
  });
});

describe('詳細パネルの改善', () => {
  const NQ = '「ノーマルクエスト」をクリアした際に獲得できる経験値が「2倍」!';
  const rowLabel = (id: string) => bar(id).closest('.g-row')?.querySelector<HTMLElement>('.g-label') as HTMLElement;

  it('左ラベルを押してもバーと同じ詳細が開く(キーボードでも開く)', () => {
    click(rowLabel('a#0'));
    expect(q('detail')?.textContent).toContain('name-a#0');
    click(q('detail-close'));
    expect(q('detail')?.textContent).toBe('');
    rowLabel('a#0').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(q('detail')?.textContent).toContain('name-a#0');
    expect(rowLabel('a#0').getAttribute('role')).toBe('button');
  });
  it('詳細の項目名は長くても省略(…)しない', () => {
    expect(fullLabel(NQ)).toBe('ノーマルクエストをクリアした際に獲得できる経験値が2倍');
    const e = ev('n#0', 'campaign', '2026-10-27T00:00:00+09:00', '2026-10-29T23:59:00+09:00', { name: NQ });
    render(root, initialState('2026-10-27', [e], INDEX));
    click(bar('n#0'));
    expect(q('detail')?.querySelector('h3')?.textContent).toBe('ノーマルクエストをクリアした際に獲得できる経験値が2倍');
    expect(q('detail')?.textContent).not.toContain('…');
  });
  it('ノーマルクエスト経験値2倍は日付・曜日・対象属性を表示する', () => {
    const e = ev('n#0', 'campaign', '2026-10-27T00:00:00+09:00', '2026-10-29T23:59:00+09:00', { name: NQ });
    render(root, initialState('2026-10-27', [e], INDEX));
    click(bar('n#0'));
    const rows = [...(q('detail')?.querySelectorAll('.detail-table tbody tr') ?? [])].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
    expect(rows).toEqual([['10/27', '火', '火属性'], ['10/28', '水', '水属性'], ['10/29', '木', '木属性']]);
    expect([...(q('detail')?.querySelectorAll('.detail-table th') ?? [])].map((c) => c.textContent)).toEqual(['日付', '曜日', '対象属性']);
    // 対象属性のセルの文字すべてが属性色(火=赤・水=青・木=緑)
    const colored = [...(q('detail')?.querySelectorAll('.detail-table td.qname') ?? [])].map((x) => [x.textContent, (x as HTMLElement).style.getPropertyValue('--pc')]);
    expect(colored).toEqual([['火属性', '#eb0043'], ['水属性', '#3154ef'], ['木属性', '#007d32']]);
  });
  it('特Lの園: 対象クエスト(獄炎の神殿=火 など、名前に属性を結び付けた設定)のセルが、その属性色の文字になる。複数属性のセルは属性の字だけ色が付く', () => {
    const e = ev('t#0', 'campaign', '2026-10-08T00:00:00+09:00', '2026-10-12T23:59:00+09:00', {
      name: '「英雄の神殿」に期間限定で「特Lの園」が出現!',
      details: [{ label: '対象クエスト', lines: ['10/8(木) 獄炎の神殿 特Lの園', '10/9(金) 秘泉の神殿 特Lの園', '10/10(土) 樹縛の神殿 特Lの園', '10/11(日) 光明の神殿 特Lの園', '10/12(月) 常闇の神殿 特Lの園'] }],
    });
    render(root, initialState('2026-10-08', [e], INDEX));
    click(bar('t#0'));
    const cells = [...(q('detail')?.querySelectorAll('.detail-table td.qname') ?? [])].map((x) => [x.textContent, (x as HTMLElement).style.getPropertyValue('--pc')]);
    expect(cells).toEqual([['獄炎の神殿 特Lの園', '#eb0043'], ['秘泉の神殿 特Lの園', '#3154ef'], ['樹縛の神殿 特Lの園', '#007d32'], ['光明の神殿 特Lの園', '#a16800'], ['常闇の神殿 特Lの園', '#a237c3']]);
    // 罫線で区切られた日(セル)ごとにバー(縁あり)。連続する日の境目は角を丸めず、縁は日ごとの属性色
    const wrap = root.querySelector('.bar-days') as HTMLElement;
    const pieces = [...wrap.querySelectorAll<HTMLElement>('.bar-ev.day-piece')];
    expect(pieces).toHaveLength(5);
    expect(pieces.map((x) => x.style.getPropertyValue('--pc'))).toEqual(['#eb0043', '#3154ef', '#007d32', '#a16800', '#a237c3']);
    expect(pieces.map((x) => [x.classList.contains('cont-l'), x.classList.contains('cont-r')])).toEqual([[false, true], [true, true], [true, true], [true, true], [true, false]]);
    expect(pieces.every((x) => x.dataset.eventId === 't#0')).toBe(true);
    const multi = ev('t#1', 'campaign', '2026-10-27T00:00:00+09:00', '2026-10-27T23:59:00+09:00', { name: NQ, details: [{ label: '対象クエスト', lines: ['10/27(火) 火・水属性クエスト'] }] });
    render(root, initialState('2026-10-27', [multi], INDEX));
    click(bar('t#1'));
    expect([...(q('detail')?.querySelectorAll('.detail-table td span.qname') ?? [])].map((x) => x.textContent)).toEqual(['火', '水']);
  });
  it('進化のバー: 週表示だけ、バーの中に `12:00解禁`(属性色)。月表示には出さない', () => {
    const e = ev('e#c0', 'character', '2026-11-10T00:00:00+09:00', '2026-11-11T00:00:00+09:00', {
      name: '蒲公英（真獣神化）',
      character: { kind: '真獣神化', at: '2026-11-10T12:00:00+09:00' },
      color: '#007d32',
    });
    const state = initialState('2026-11-09', [e], INDEX);
    render(root, state);
    const t = root.querySelector('.bar-ev[data-event-id="e#c0"] .bar-unlock') as HTMLElement;
    expect(t.textContent).toBe('12:00解禁');
    expect(t.style.getPropertyValue('--pc')).toBe('#007d32');
    state.view = 'month';
    render(root, state);
    expect(root.querySelector('.bar-unlock')).toBeNull();
  });
  it('1日に属性が複数(ノーマルクエストの土曜: 火・水・木)なら、色ごとにバーを作る。境目は角を丸めず余白なし', () => {
    const e = ev('s#0', 'campaign', '2026-10-24T00:00:00+09:00', '2026-10-25T23:59:00+09:00', { name: NQ });
    render(root, initialState('2026-10-24', [e], INDEX));
    const pieces = [...root.querySelectorAll<HTMLElement>('.bar-days .bar-ev')];
    // 土=火・水・木、日=光・闇 → 5つ
    expect(pieces.map((x) => x.style.getPropertyValue('--pc'))).toEqual(['#eb0043', '#3154ef', '#007d32', '#a16800', '#a237c3']);
    expect(pieces.map((x) => x.classList.contains('cont-l'))).toEqual([false, true, true, true, true]);
    expect(pieces.map((x) => x.classList.contains('cont-r'))).toEqual([true, true, true, true, false]);
    expect(pieces.slice(1, 4).every((x) => x.style.marginLeft === '0px' && x.style.marginRight === '0px')).toBe(true);
    // 日(セル)ごとの入れ物: 土に3つ、日に2つ
    expect([...root.querySelectorAll('.bar-days .day-cell')].map((c) => c.querySelectorAll('.bar-ev').length)).toEqual([3, 2]);
  });
  it('event.details(対象ステージ等)を見出し付きで表示する。同ラベルの統合で項目が和集合になる', () => {
    const a = ev('k#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T11:59:00+09:00', {
      name: '「禁忌の獄」が登場！',
      details: [{ label: '本開催の「禁忌の獄～深淵〜」対象ステージ', lines: ['火獄の無量大数', '水獄の阿頼耶'] }],
    });
    const b = ev('k#1', 'event', '2026-10-28T12:00:00+09:00', '2026-10-30T11:59:00+09:00', {
      name: '「禁忌の獄」が登場！ #2',
      details: [{ label: '本開催の「禁忌の獄～深淵〜」対象ステージ', lines: ['水獄の阿頼耶', '木獄の涅槃寂静'] }],
    });
    render(root, initialState('2026-10-27', [a, b], INDEX));
    click(bar('k#0'));
    expect(q('detail')?.querySelector('h4')?.textContent).toBe('本開催の「禁忌の獄～深淵〜」対象ステージ');
    expect([...(q('detail')?.querySelectorAll('.detail-block li') ?? [])].map((l) => l.textContent)).toEqual(['火獄の無量大数', '水獄の阿頼耶', '木獄の涅槃寂静']);
  });
  it('選択すると詳細パネルへスクロールし、閉じるときは動かさない', () => {
    const calls: unknown[] = [];
    HTMLElement.prototype.scrollIntoView = function (o?: boolean | ScrollIntoViewOptions) {
      calls.push(o);
    };
    click(bar('a#0'));
    expect(calls).toHaveLength(1);
    click(q('detail-close'));
    expect(calls).toHaveLength(1);
  });
  it('詳細を開いたまま、セクションや小見出しを開閉しても、詳細パネルへスクロールしない(別の項目を選んだときは動く)', () => {
    const calls: unknown[] = [];
    HTMLElement.prototype.scrollIntoView = function (o?: boolean | ScrollIntoViewOptions) {
      calls.push(o);
    };
    click(bar('a#0'));
    expect(calls).toHaveLength(1);
    click(root.querySelector<HTMLElement>('.g-section') as HTMLElement); // 畳む
    click(root.querySelector<HTMLElement>('.g-section') as HTMLElement); // 開く
    expect(calls).toHaveLength(1);
    expect(q('detail-close')).not.toBeNull(); // 選択は残っている
  });
});

describe('週/月表示', () => {
  it('monthDays / addMonths', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2028-02')).toHaveLength(29);
    expect(monthDays('2026-10')[0]).toBe('2026-10-01');
    expect(monthDays('2026-10')[30]).toBe('2026-10-31');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  const first = () => cols()[0]?.dataset.day;
  const monthLabel = () => root.querySelector('.g-dates .g-label')?.textContent;
  it('バーの左右は列内の暦の時刻で詰める。12:00=列のちょうど半分', () => {
    const days = weekDays('2026-10-27');
    const s = barSpan(ev('t#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T04:00:00+09:00'), days);
    expect(s?.startFrac).toBeCloseTo(0.5);
    expect(s?.endFrac).toBeCloseTo(1 / 6);
    const s2 = barSpan(ev('t#1', 'event', '2026-10-27T04:00:00+09:00', '2026-10-29T12:00:00+09:00'), days);
    expect(s2?.startFrac).toBeCloseTo(1 / 6);
    expect(s2?.to).toBe(2);
    expect(s2?.endFrac).toBeCloseTo(0.5);
    expect(barSpan(ev('t#2', 'event', '2026-10-20T12:00:00+09:00', '2026-11-10T12:00:00+09:00'), days)).toMatchObject({ startFrac: 0, endFrac: 1 });
  });
  it('UI: 12:00開始/12:00終了のバーは列の半分ぶん内側へ(1日バーなら左右とも25%)', () => {
    state.events = [ev('p#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-28T12:00:00+09:00')];
    render(root, state);
    expect(bar('p#0').style.marginLeft).toBe('calc(25.000% + 2px)');
    expect(bar('p#0').style.marginRight).toBe('calc(25.000% + 2px)');
  });
  it('同じ表示ラベルで期間が離れたものは1行に並ぶ(月表示。行を分けない)', () => {
    state.events = [
      ev('r#0', 'event', '2026-10-28T12:00:00+09:00', '2026-10-30T11:59:00+09:00', { name: '絶級トーナメント' }),
      ev('r#1', 'event', '2026-11-10T12:00:00+09:00', '2026-11-15T11:59:00+09:00', { name: '絶級トーナメント' }),
    ];
    click(q('view-toggle'));
    expect(root.querySelectorAll('.g-row:not(.g-dates)')).toHaveLength(1);
    expect(bars()).toHaveLength(2);
  });
  it('既定は週表示(7日)。月ボタンで今日から翌月同日の前日まで、週に戻せる。ヘッダに期間の重複表示は無い', () => {
    expect(cols()).toHaveLength(7);
    click(q('view-toggle'));
    expect(cols()).toHaveLength(31);
    expect(monthLabel()).toBe('2026年10月');
    expect(span('a#0')).toBe('2/5'); // 10/27(左端=grid列2)〜10/29 11:59
    expect(root.querySelector('.month-title')).toBeNull();
    click(q('view-toggle'));
    expect(cols()).toHaveLength(7);
  });
  it('日付の行の左端に「年月」を出し、1月1日の目印には年も付ける(年またぎが分かる)', () => {
    state.weekStart = '2026-12-30';
    state.monthStart = '2026-12-30';
    click(q('view-toggle'));
    render(root, state);
    expect(root.querySelector('.g-dates .g-label')?.textContent).toBe('2026年12月');
    expect(root.querySelector('.g-date[data-day="2027-01-01"] .dmon')?.textContent).toBe('2027年1月');
    expect(root.querySelector('.g-date[data-day="2027-01-02"] .dmon')).toBeNull();
  });
  it('カレンダーの移動は表示範囲(今日から過去・未来それぞれ12か月)まで。端で < > が無効になり、週・月どちらでも越えない', () => {
    for (let i = 0; i < 80; i++) click(q('nav-next'));
    expect(first()).toBe('2027-10-27');
    expect((q('nav-next') as HTMLButtonElement).disabled).toBe(true);
    click(q('view-toggle'));
    for (let i = 0; i < 24; i++) click(q('nav-next'));
    expect(first()).toBe('2027-10-27');
    for (let i = 0; i < 200; i++) click(q('nav-prev'));
    expect(first()).toBe('2025-10-27');
    expect((q('nav-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((q('nav-next') as HTMLButtonElement).disabled).toBe(false);
  });
  it('週⇄月の切替で、切替前の左端の日が切替後も左端になる(移動後の週・月のどちらからでも)。● の基準は今日のまま', () => {
    click(q('nav-next')); // 週を +7日(11/3 が左端)
    expect(first()).toBe('2026-11-03');
    click(q('view-toggle'));
    expect(first()).toBe('2026-11-03'); // 週→月
    click(q('nav-next')); // 月を +1か月(12/3 が左端)
    expect(first()).toBe('2026-12-03');
    click(q('view-toggle'));
    expect(first()).toBe('2026-12-03'); // 月→週
    expect(cols()).toHaveLength(7);
    click(q('nav-today'));
    expect(first()).toBe('2026-10-27');
    click(q('view-toggle'));
    expect(first()).toBe('2026-10-27'); // 今日が左端のまま月へ
    expect((q('nav-today') as HTMLButtonElement).disabled).toBe(true);
  });
  it('ドラッグで動かした左端も、切替後に引き継ぐ', () => {
    const fire = (type: string, x: number, target: EventTarget = document) => target.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
    fire('pointerdown', 300, root.querySelector('.gantt') as HTMLElement);
    fire('pointermove', 260); // +1日
    fire('pointerup', 260);
    expect(first()).toBe('2026-10-28');
    click(q('view-toggle'));
    expect(first()).toBe('2026-10-28');
    expect((q('nav-today') as HTMLButtonElement).disabled).toBe(false);
  });
  it('月表示は今日が左端。< > で同じ日の前後の月へ(年またぎ含む)、フォーカスは押したボタンに残る', () => {
    click(q('view-toggle'));
    expect(first()).toBe('2026-10-27');
    expect(cols()).toHaveLength(31);
    click(q('nav-next'));
    expect(cols()).toHaveLength(30); // 11/27〜12/26
    expect(first()).toBe('2026-11-27');
    expect(root.querySelector('.day.today')).toBeNull();
    for (let i = 0; i < 2; i++) click(q('nav-next'));
    expect(first()).toBe('2027-01-27');
    for (let i = 0; i < 3; i++) click(q('nav-prev'));
    expect(first()).toBe('2026-10-27');
    expect(document.activeElement).toBe(q('nav-prev'));
    expect(root.querySelector('.day.today')).not.toBeNull();
  });
  it('月表示も横ドラッグで1日ずつスライドする', () => {
    click(q('view-toggle'));
    const fire = (type: string, x: number, target: EventTarget = document) => target.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
    fire('pointerdown', 300, root.querySelector('.gantt') as HTMLElement);
    fire('pointermove', 260); // 未計測の列幅=40px → +1日
    expect(first()).toBe('2026-10-28');
    expect(cols()).toHaveLength(31);
    fire('pointerup', 260);
  });
  it('月表示: ドラッグ後は ● が有効、押すと今日起点に戻り無効。窓が月をまたぐ 11/1 に「11月」', () => {
    click(q('view-toggle'));
    expect(root.querySelector('.g-date[data-day="2026-11-01"] .dmon')?.textContent).toBe('11月');
    const fire = (type: string, x: number, target: EventTarget = document) => target.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
    fire('pointerdown', 300, root.querySelector('.gantt') as HTMLElement);
    fire('pointermove', 100); // 200px=5列(未計測=40px) → +5日
    fire('pointerup', 100);
    expect(first()).toBe('2026-11-01');
    expect((q('nav-today') as HTMLButtonElement).disabled).toBe(false);
    click(q('nav-today'));
    expect(first()).toBe('2026-10-27');
    expect((q('nav-today') as HTMLButtonElement).disabled).toBe(true);
  });
  it('addMonthsToDay: 存在しない日は月末日', () => {
    expect(addMonthsToDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDay('2026-12-15', 1)).toBe('2027-01-15');
    expect(monthWindow('2026-01-31')).toHaveLength(28);
    expect(monthWindow('2026-12-31').slice(-1)).toEqual(['2027-01-30']); // 年またぎ(翌月同日=1/31の前日)
    expect(monthWindow('2028-02-29')).toHaveLength(29); // うるう年: 2/29〜3/28(3/29の前日)
    expect(addMonthsToDay(addMonthsToDay('2026-01-31', 1), 1)).toBe('2026-03-28'); // クランプ後の日が起点になる
  });
  it('週表示の < > で7日ずつ前後へ', () => {
    expect(first()).toBe('2026-10-27');
    click(q('nav-next'));
    expect(first()).toBe('2026-11-03');
    click(q('nav-prev'));
    click(q('nav-prev'));
    expect(first()).toBe('2026-10-20');
    expect(cols()).toHaveLength(7);
  });
  it('イベントの無い月は空表示', () => {
    click(q('view-toggle'));
    click(q('nav-next'));
    click(q('nav-next'));
    click(q('nav-next'));
    expect(root.querySelector('.empty')?.textContent).toBe('この月に表示するイベントはありません');
  });
});

describe('毎月10/20/30日の項目', () => {
  it('30日が無い月は月末日で代用。同じ日に重複しない', () => {
    expect(monthlyDays('2026-10', [10, 20, 30])).toEqual(['2026-10-10', '2026-10-20', '2026-10-30']);
    expect(monthlyDays('2026-02', [10, 20, 30])).toEqual(['2026-02-10', '2026-02-20', '2026-02-28']);
    expect(monthlyDays('2028-02', [10, 20, 30])).toEqual(['2028-02-10', '2028-02-20', '2028-02-29']);
    expect(monthlyDays('2026-02', [28, 30, 31])).toEqual(['2026-02-28']);
  });
  it('範囲内の日だけ生成する', () => {
    const e = monthlyEvents('2026-10-15', '2026-11-12', MONTHLY).filter((x) => x.name === 'モンストの日');
    expect(e.map((x) => x.start.slice(0, 10))).toEqual(['2026-10-20', '2026-10-30', '2026-11-10']);
  });
  it('月表示: モンストの日はキャンペーン先頭、タイムボーナスは英雄の神殿ノーコンテニューの直下', () => {
    state.events = [
      ev('n#0', 'campaign', '2026-11-05T00:00:00+09:00', '2026-11-06T23:59:00+09:00', { name: 'ノーマルクエスト経験値が2倍' }),
      ev('h#0', 'campaign', '2026-11-05T00:00:00+09:00', '2026-11-06T23:59:00+09:00', { name: '英雄の神殿の「ノーコンテニュー報酬」でわくわくの実が2個排出!' }),
      ev('s#0', 'campaign', '2026-11-08T00:00:00+09:00', '2026-11-12T23:59:00+09:00', { name: '「英雄の神殿」に期間限定で「特Lの園」が出現!' }),
    ];
    state.monthly = MONTHLY;
    click(q('view-toggle'));
    const names = [...root.querySelectorAll('.g-row:not(.g-dates) .g-l1')].map((x) => x.textContent);
    const i = names.indexOf('モンストの日');
    expect(i).toBe(0);
    const rows = [...root.querySelectorAll('.g-row:not(.g-dates)')].map((r) => r.querySelector('.g-label')?.textContent ?? '');
    // 行ラベルは上書き: ノーコンテニュー報酬2倍 / タイムボーナス報酬2倍
    const nc = rows.findIndex((t) => t.includes('ノーコンテニュー報酬2倍'));
    expect(nc).toBeGreaterThanOrEqual(0);
    expect(rows[nc + 1]).toContain('タイムボーナス報酬2倍');
    expect(bars().filter((b) => b.dataset.eventId?.startsWith('monthly:モンストの日'))).toHaveLength(3);
  });
});

describe('セクションの振り分け', () => {
  it('eventカテゴリでも英雄の神殿などはキャンペーンへ。クエスト内は「クエスト」系を下にまとめる', () => {
    state.events = [
      ev('h#0', 'event', '2026-10-27T00:00:00+09:00', '2026-10-28T23:59:00+09:00', { name: '英雄の神殿の消費スタミナが1/2!' }),
      ev('q#0', 'event', '2026-10-27T00:00:00+09:00', '2026-10-28T23:59:00+09:00', { name: '13周年記念クエスト開催' }),
      ev('t#0', 'event', '2026-10-27T00:00:00+09:00', '2026-10-28T23:59:00+09:00', { name: '覇者の塔' }),
      ev('u#0', 'event', '2026-10-27T00:00:00+09:00', '2026-10-28T23:59:00+09:00', { name: '超究極クエスト' }),
    ];
    render(root, state);
    const r = ganttSections(state.events, weekDays('2026-10-27'));
    expect(r.find((g) => g.section.id === 'campaign')?.bars.map((b) => b.event.id)).toEqual(['h#0']);
    expect(r.find((g) => g.section.id === 'quest')?.bars.map((b) => b.event.id)).toEqual(['t#0', 'q#0', 'u#0']);
  });
  it('クエストは 覇者の塔→絶級トーナメント→禁忌の獄→破界の星墓→未開の幻洞→その他。キャンペーンはイベントクエストが英雄の神殿の後・追憶の書庫の前。Webショップもキャンペーン', () => {
    const t = '2026-10-27T00:00:00+09:00';
    const e = '2026-10-28T23:59:00+09:00';
    const names = ['破界の星墓', '未開の幻洞', '禁忌の獄', '絶級トーナメント', '覇者の塔', '召喚の鍵'];
    const camp = ['追憶の書庫で金卵2倍', 'イベントクエストで宝箱+1', '英雄の神殿の特Lの園', 'モンストWebショップで真獣神玉10個を無料プレゼント!'];
    state.events = [...names, ...camp].map((n, i) => ev(`o${i}#0`, 'event', t, e, { name: n }));
    const r = ganttSections(state.events, weekDays('2026-10-27'));
    expect(r.find((g) => g.section.id === 'quest')?.bars.map((b) => b.event.name)).toEqual(['覇者の塔', '絶級トーナメント', '禁忌の獄', '破界の星墓', '未開の幻洞', '召喚の鍵']);
    expect(r.find((g) => g.section.id === 'campaign')?.bars.map((b) => b.event.name)).toEqual(['英雄の神殿の特Lの園', 'イベントクエストで宝箱+1', '追憶の書庫で金卵2倍', 'モンストWebショップで真獣神玉10個を無料プレゼント!']);
  });
});

describe('今日ボタンとドラッグ移動', () => {
  const first = () => cols()[0]?.dataset.day;
  it('今日ボタン: 基準なら無効、移動後は有効で基準(週・月とも今日スタート)へ戻る', () => {
    expect((q('nav-today') as HTMLButtonElement).disabled).toBe(true);
    click(q('nav-next'));
    expect((q('nav-today') as HTMLButtonElement).disabled).toBe(false);
    click(q('nav-today'));
    expect(first()).toBe('2026-10-27');
    click(q('view-toggle'));
    click(q('nav-prev'));
    click(q('nav-today'));
    expect(first()).toBe('2026-10-27');
  });
  it('dragShift: 左へ1列ぶんドラッグ=+1日(週・月共通)', () => {
    expect(dragShift(-80, 80)).toBe(1);
    expect(dragShift(160, 80)).toBe(-2);
    expect(dragShift(-20, 80)).toBe(0);
    expect(dragShift(-50, 30)).toBe(2); // 月表示も1列=1日
  });
  it('ドラッグ中に表示がずれ(放す前に確定)、ドラッグ直後のクリックは無視される', () => {
    const fire = (type: string, x: number, target: EventTarget = document) => target.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
    const grid = () => root.querySelector('.gantt') as HTMLElement;
    fire('pointerdown', 300, grid());
    fire('pointermove', 260); // 40px=列幅(未計測=40px)ぶん → +1日(左へ)
    fire('pointermove', 220);
    expect(first()).toBe('2026-10-29'); // まだ放していない
    fire('pointermove', 300); // 元の位置へ戻せば元の日付
    expect(first()).toBe('2026-10-27');
    fire('pointerup', 300);
    const b = bars()[0] as HTMLElement;
    b.click();
    expect(q('detail')?.textContent).toBe('');
    b.click();
    expect(q('detail')?.textContent).not.toBe('');
  });
});

describe('section toggle', () => {
  const head = (id: string) => root.querySelector<HTMLElement>(`.g-section[data-section="${id}"]`) as HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    state = initialState('2026-10-27', EVENTS, INDEX);
    render(root, state);
  });

  it('collapses and expands a section, showing the row count when folded', () => {
    const id = sections()[0] as string;
    const rows = bars().length;
    expect(head(id).getAttribute('aria-expanded')).toBe('true');
    click(head(id));
    expect(head(id).getAttribute('aria-expanded')).toBe('false');
    expect(head(id).textContent).toMatch(/\(\d+\)$/);
    expect(bars().length).toBeLessThan(rows);
    click(head(id));
    expect(bars().length).toBe(rows);
    expect(head(id).textContent).not.toMatch(/\(\d+\)$/);
  });
  it('keeps the folded state across navigation and persists it', () => {
    const id = sections()[0] as string;
    click(head(id));
    click(q('nav-prev'));
    click(q('nav-today'));
    expect(head(id).getAttribute('aria-expanded')).toBe('false');
    expect(JSON.parse(localStorage.getItem('collapsedSections') as string)).toContain(id);
    expect(initialState('2026-10-27', EVENTS, INDEX).collapsed.has(id)).toBe(true);
  });
  it('toggles with the keyboard', () => {
    const id = sections()[0] as string;
    head(id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(head(id).getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps focus on the header after a keyboard toggle, Space also works', () => {
    const id = sections()[0] as string;
    document.body.append(root);
    head(id).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(head(id).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(head(id));
  });
  it('folded count equals the number of rows, and the other sections stay open', () => {
    const ids = sections() as string[];
    const rowsOf = (id: string) => {
      let n = 0;
      for (let e = head(id).nextElementSibling; e && !e.classList.contains('g-section'); e = e.nextElementSibling) if (e.classList.contains('g-row')) n++;
      return n;
    };
    const n = rowsOf(ids[0] as string);
    click(head(ids[0] as string));
    expect(head(ids[0] as string).textContent).toMatch(new RegExp(`\\(${n}\\)$`));
    for (const id of ids.slice(1)) expect(head(id).getAttribute('aria-expanded')).toBe('true');
  });
  it('a drag that starts on a header does not toggle it', () => {
    const id = sections()[0] as string;
    const h = head(id);
    const fire = (type: string, x: number, target: EventTarget = document) => target.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
    fire('pointerdown', 300, h);
    fire('pointermove', 200);
    fire('pointerup', 200);
    h.click();
    expect(state.collapsed.has(id)).toBe(false);
  });
  it('tolerates broken or failing localStorage', () => {
    for (const v of ['{broken', '{"a":1}', '[1,"x"]']) {
      localStorage.setItem('collapsedSections', v);
      expect(() => initialState('2026-10-27', EVENTS, INDEX)).not.toThrow();
    }
    expect(initialState('2026-10-27', EVENTS, INDEX).collapsed).toEqual(new Set(['x']));
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      const id = sections()[0] as string;
      click(head(id));
      expect(head(id).getAttribute('aria-expanded')).toBe('false');
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});

describe('メンテナンスの帯', () => {
  const m = ev('m#0', 'maintenance', '2026-10-29T00:00:00+09:00', '2026-10-29T05:00:00+09:00', {
    name: 'Ver.33.0アップデートメンテナンス',
    details: [{ label: 'メンテナンス内容', lines: ['Ver.33.0アップデート'] }],
  });
  const maintBtn = () => root.querySelector<HTMLElement>('.g-maint');
  it('行ではなく全体を貫く帯で出し、時刻の割合で幅を詰める', () => {
    state.events = [...EVENTS, m];
    render(root, state);
    expect(maintBtn()?.dataset.maintId).toBe('m#0');
    expect(maintBtn()?.style.gridColumn.replace(/\s/g, '')).toBe('3/4'); // 10/27起点の3列目=10/29
    expect(maintBtn()?.style.marginRight).toBe(`${(((1 - 5 / 24) / 1) * 100).toFixed(3)}%`); // 0:00〜5:00 は列の5/24
    expect(root.querySelector('.g-dates .g-maint-layer')).toBeNull(); // 日付ヘッダのクリックを奪わない層の外
    expect(root.querySelector('.bar-ev[data-event-id="m#0"]')).toBeNull();
    expect(sections()).not.toContain('other');
  });
  it('帯を押すと実施日程・内容・リンクを詳細に出す。日付を押しても出る', () => {
    state.events = [...EVENTS, m];
    render(root, state);
    click(maintBtn());
    const d = q('detail')?.textContent ?? '';
    expect(d).toContain('Ver.33.0アップデートメンテナンス');
    expect(d).toContain('実施日程: 10/29(木) 00:00 〜 10/29(木) 05:00');
    expect(d).toContain('メンテナンス内容');
    expect(d).toContain('Ver.33.0アップデート');
    expect(q('detail')?.querySelector('a')?.getAttribute('href')).toBe('https://example.test/m#0');
    click(q('detail-close'));
    click(col('2026-10-29'));
    expect(q('detail')?.textContent).toContain('Ver.33.0アップデートメンテナンス');
    click(col('2026-10-30'));
    expect(q('detail')?.textContent).not.toContain('メンテナンス');
  });
  it('maintenanceOnDay: 終了ちょうど0:00の翌日にはかからない。終了未定は開始日のみ', () => {
    const x = ev('m#1', 'maintenance', '2026-10-29T22:00:00+09:00', '2026-10-30T00:00:00+09:00');
    expect(maintenanceOnDay(x, '2026-10-29')).toBe(true);
    expect(maintenanceOnDay(x, '2026-10-30')).toBe(false);
    const open = ev('m#2', 'maintenance', '2026-10-29T10:00:00+09:00', null);
    expect([maintenanceOnDay(open, '2026-10-28'), maintenanceOnDay(open, '2026-10-29'), maintenanceOnDay(open, '2026-10-30')]).toEqual([false, true, false]);
    expect(maintenanceBars([open], weekDays('2026-10-27'))).toHaveLength(1);
  });
  it('メンテナンスが無ければ帯の層は出ない', () => {
    render(root, state);
    expect(root.querySelector('.g-maint-layer')).toBeNull();
  });
});

describe('降臨スケジュールの並び', () => {
  it('クエスト内は 定例→絶級(滅絶→黎絶→轟絶)→期間限定クエスト→超究極→その他', () => {
    const t = '2026-10-27T00:00:00+09:00';
    const e = '2026-10-28T23:59:00+09:00';
    const names = ['13周年記念クエスト', '轟絶 ヴェイン降臨', '召喚の鍵', '超究極クエスト', '覇者の塔', '黎絶 キャローネ降臨', '滅絶 ミナト降臨', '禁忌の獄'];
    const r = ganttSections(names.map((n, i) => ev(`r${i}#0`, 'event', t, e, { name: n })), weekDays('2026-10-27'));
    expect(r.find((g) => g.section.id === 'quest')?.bars.map((b) => b.event.name)).toEqual(['覇者の塔', '禁忌の獄', '滅絶 ミナト降臨', '黎絶 キャローネ降臨', '轟絶 ヴェイン降臨', '13周年記念クエスト', '超究極クエスト', '召喚の鍵']);
  });
});

describe('クエストの小見出し', () => {
  const t = '2026-10-27T00:00:00+09:00';
  const e = '2026-10-28T23:59:00+09:00';
  it('questGroup は名称から小見出しを決める', () => {
    expect(['覇者の塔', '黎絶 キャローネ降臨', '13周年記念クエスト', '超究極クエスト（大黒天）', '召喚の鍵'].map((n) => questGroup({ name: n }))).toEqual(['定例クエスト', '絶級クエスト', '期間限定クエスト', '超究極クエスト', 'その他']);
  });
  it('小見出しは該当行の直前に置かれ、該当なしは出さない。超究極はキャラ名（補足）', () => {
    state.events = ['禁忌の獄', '轟絶 ヴェイン降臨', '滅絶 ミナト降臨', '超究極・兵クエスト（ミザリー）が10/30より出現！', '超究極クエスト「糸師 凛」が登場!'].map((n, i) => ev(`q${i}#0`, 'event', t, e, { name: n }));
    state.collapsed.clear(); // 他テストの開閉状態(localStorage)を持ち越さない
    render(root, state);
    const order = [...root.querySelectorAll('.g-inner .g-rows > .g-group, .g-inner .g-rows > .g-row')].map((x) => (x.classList.contains('g-group') ? `H:${x.textContent}` : `R:${x.querySelector('.g-l1')?.textContent}`));
    expect(order).toEqual(['H:定例クエスト', 'R:禁忌の獄', 'H:絶級クエスト', 'R:滅絶 ミナト', 'R:轟絶 ヴェイン', 'H:超究極クエスト', 'R:糸師 凛', 'R:ミザリー（兵）']);
  });
  it('期間限定クエスト・その他の小見出しと、キャラ名なし超究極の従来表示、超究極同士の開始順', () => {
    state.events = [
      ev('a#0', 'event', t, e, { name: '13周年記念クエスト' }),
      ev('b#0', 'event', t, e, { name: '召喚の鍵' }),
      ev('c#0', 'event', '2026-10-28T00:00:00+09:00', e, { name: '超究極クエスト（大黒天）が登場！' }),
      ev('d#0', 'event', t, e, { name: '超究極クエストが2/20より登場！' }),
    ];
    state.collapsed.clear();
    render(root, state);
    const order = [...root.querySelectorAll('.g-inner .g-rows > .g-group, .g-inner .g-rows > .g-row')].map((x) => (x.classList.contains('g-group') ? `H:${x.textContent}` : `R:${x.querySelector('.g-l1')?.textContent}`));
    expect(order).toEqual(['H:期間限定クエスト', 'R:13周年記念クエスト', 'H:超究極クエスト', 'R:超究極クエスト', 'R:大黒天', 'H:その他', 'R:召喚の鍵']);
  });
  it('superUltimateLabel: 補足があれば（補足）、無ければ括弧ごと省く。キャラ名が無ければ null', () => {
    expect(superUltimateLabel('超究極・兵クエスト（ミザリー）が10/30より期間限定で出現！ #1')).toBe('ミザリー（兵）');
    expect(superUltimateLabel('超究極・傑クエスト（ララバイ）が9/18より出現！ #1')).toBe('ララバイ（傑）');
    expect(superUltimateLabel('超究極クエスト（大黒天）が10/9 19時より期間限定で登場！')).toBe('大黒天');
    expect(superUltimateLabel('超究極クエスト「新郷ハヤト」が登場!')).toBe('新郷ハヤト');
    expect(superUltimateLabel('超究極「バニル」が登場!(追加情報:3/19)')).toBe('バニル');
    expect(superUltimateLabel('超究極クエストが2/20より期間限定で登場！')).toBeNull();
    expect(superUltimateLabel('超究極クエスト (大黒天)')).toBe('大黒天');
    expect(superUltimateLabel('超究極・兵クエストが10/30より登場!（追加情報:10/31）')).toBeNull(); // 補足が括弧の外へ伸びない
  });
});

describe('小見出し内の並び', () => {
  const t = '2026-10-27T00:00:00+09:00';
  const e = '2026-10-28T23:59:00+09:00';
  const sorted = (cat: string, sec: string, names: string[]): string[] => {
    const r = ganttSections(names.map((n, i) => ev(`s${i}#0`, cat, t, e, { name: n })), weekDays('2026-10-27'));
    return (r.find((g) => g.section.id === sec)?.bars ?? []).map((b) => b.event.name);
  };
  it('英雄の神殿/追憶の書庫/守護獣の森', () => {
    expect(sorted('campaign', 'campaign', ['「英雄の神殿」に特Lの園', '「英雄の神殿」の消費スタミナが1/2', '「英雄の神殿」でチャンスバトル', '英雄の神殿のタイムボーナス報酬', '英雄の神殿のノーコンテニュー報酬'])).toEqual(['英雄の神殿のノーコンテニュー報酬', '英雄の神殿のタイムボーナス報酬', '「英雄の神殿」の消費スタミナが1/2', '「英雄の神殿」でチャンスバトル', '「英雄の神殿」に特Lの園']); // 消費スタミナとチャンスバトルは入れ替え
    expect(sorted('campaign', 'campaign', ['追憶の書庫でお助けアイテム使い放題', '「追憶の書庫」のクエストで書庫ポイントの消費が0', '「追憶の書庫」でスコア報酬に5倍', '「追憶の書庫」の絶級クエストでスペシャル報酬が2倍', '「追憶の書庫」で金卵の排出率が2倍'])).toEqual(['「追憶の書庫」で金卵の排出率が2倍', '「追憶の書庫」の絶級クエストでスペシャル報酬が2倍', '「追憶の書庫」でスコア報酬に5倍', '「追憶の書庫」のクエストで書庫ポイントの消費が0', '追憶の書庫でお助けアイテム使い放題']);
    expect(sorted('campaign', 'campaign', ['「守護獣の森」でスコア報酬5倍', '「守護獣の森」の排出量が2倍'])).toEqual(['「守護獣の森」の排出量が2倍', '「守護獣の森」でスコア報酬5倍']);
  });
  it('強化進化クエストはノーマルクエストと英雄の神殿の間の小見出し。モンスポットはオーブ系(名前順)→出現確率→ラッキーバルーン', () => {
    state.events = ['「ノーマルクエスト」の経験値が2倍', '「英雄の神殿」に特Lの園', '強化進化クエストに「デイリー真獣神玉を求めて」が登場!', '≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ!', '≪モンスポット≫「学びのパワー」の出現確率がアップ!', '≪モンスポット≫オーブのカケラドロップ数2倍!', '≪モンスポット≫オーブおかわり!1日に2回生成が可能!'].map((n, i) => ev(`e${i}#0`, 'event', t, e, { name: n }));
    state.collapsed.clear();
    render(root, state);
    expect([...root.querySelectorAll('.g-group')].map((g) => g.textContent)).toEqual(['ノーマルクエスト', '強化進化クエスト', '英雄の神殿', 'モンスポット']);
    expect(sorted('event', 'campaign', state.events.map((x) => x.name)).filter((n) => n.includes('モンスポット'))).toEqual(['≪モンスポット≫オーブおかわり!1日に2回生成が可能!', '≪モンスポット≫オーブのカケラドロップ数2倍!', '≪モンスポット≫「学びのパワー」の出現確率がアップ!', '≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ!']);
  });
  it('モンスポットは出現確率(名前順)→ラッキーバルーン。CM視聴はミッションに入り名前順', () => {
    expect(sorted('campaign', 'campaign', ['≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ!', '≪モンスポット≫「至宝のパワー」の出現確率がアップ!', '≪モンスポット≫「学びのパワー」の出現確率がアップ!', '≪モンスポット≫「スコア稼ぎのパワー」の出現確率がアップ!'])).toEqual(['≪モンスポット≫「スコア稼ぎのパワー」の出現確率がアップ!', '≪モンスポット≫「学びのパワー」の出現確率がアップ!', '≪モンスポット≫「至宝のパワー」の出現確率がアップ!', '≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ!']);
    const m = ['期間限定「タイムシフト活用ミッション」開催!', 'CM視聴でモンスターBOX10枠拡張確定!', '期間限定「クエストサーチ活用ミッション」開催!'];
    expect(sorted('campaign', 'campaign', m)).toEqual(['CM視聴でモンスターBOX10枠拡張確定!', '期間限定「クエストサーチ活用ミッション」開催!', '期間限定「タイムシフト活用ミッション」開催!']);
    state.events = m.map((n, i) => ev(`c${i}#0`, 'campaign', t, e, { name: n }));
    state.collapsed.clear();
    render(root, state);
    expect([...root.querySelectorAll('.g-group')].map((g) => g.textContent)).toEqual(['ミッション']);
  });
  it('語に一致しない行は * の位置(無ければ末尾)、設定の無い小見出しは開始順、直接の語が別名より優先', () => {
    // 英雄の神殿: 一致しない行(期間限定ステージ)は末尾
    expect(sorted('campaign', 'campaign', ['「英雄の神殿」クエストに期間限定ステージ「感謝の間」が登場!', '「英雄の神殿」に特Lの園', '「英雄の神殿」でチャンスバトル'])).toEqual(['「英雄の神殿」でチャンスバトル', '「英雄の神殿」に特Lの園', '「英雄の神殿」クエストに期間限定ステージ「感謝の間」が登場!']);
    // モンスポット: 一致しない行は「*」(ラッキーバルーンの前)
    expect(sorted('campaign', 'campaign', ['≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ!', '≪モンスポット≫オーブのカケラドロップ数2倍!'])).toEqual(['≪モンスポット≫オーブのカケラドロップ数2倍!', '≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ!']);
    // 設定の無い小見出し(イベントクエスト)は開始順
    const r = ganttSections([ev('x#0', 'campaign', '2026-10-28T00:00:00+09:00', e, { name: '「イベントクエスト」でB' }), ev('x#1', 'campaign', t, e, { name: '「イベントクエスト」でA' })], weekDays('2026-10-27'));
    expect(r[0]?.bars.map((b) => b.event.id)).toEqual(['x#1', 'x#0']);
    // CM視聴の別名より直接のグループ語(モンスポット)が優先
    expect(campaignGroup({ name: 'CM視聴で≪モンスポット≫の確率アップ' })).toBe('モンスポット');
    expect(campaignGroup({ name: 'CM視聴でBOX拡張' })).toBe('ミッション');
  });
  it('期間限定クエストは名前順、絶級は階級内で名前順、超究極は補足なし→補足(名前)→キャラ名', () => {
    expect(sorted('event', 'quest', ['超究極クエスト（大黒天）', '超究極・兵クエスト（ミザリー）', '超究極・傑クエスト（ララバイ）', '超究極クエスト（イザナミ）', '超究極・兵クエスト（グノーシス）', '黎絶 ミナト降臨', '轟絶 アルファ降臨', '黎絶 アルファ降臨', '滅絶 ゼータ降臨', '14周年記念クエスト（ビ）', '13周年記念クエスト（ア）'])).toEqual([
      '滅絶 ゼータ降臨', '黎絶 アルファ降臨', '黎絶 ミナト降臨', '轟絶 アルファ降臨',
      '13周年記念クエスト（ア）', '14周年記念クエスト（ビ）',
      '超究極クエスト（イザナミ）', '超究極クエスト（大黒天）', '超究極・傑クエスト（ララバイ）', '超究極・兵クエスト（グノーシス）', '超究極・兵クエスト（ミザリー）',
    ]);
  });
});

describe('キャンペーンの小見出し', () => {
  const t = '2026-10-27T00:00:00+09:00';
  const e = '2026-10-28T23:59:00+09:00';
  const groups = () => [...root.querySelectorAll<HTMLElement>('.g-group')].map((g) => g.textContent);
  it('グループごとに小見出しを置く(該当なしは出さない。ミッションは末尾のグループ、グループ外は「その他」)', () => {
    state.events = ['追憶の書庫で金卵2倍', '英雄の神殿の特Lの園', '期間限定「ミッション」登場', '謎のキャンペーン'].map((n, i) => ev(`g${i}#0`, 'campaign', t, e, { name: n }));
    render(root, state);
    expect(groups()).toEqual(['英雄の神殿', '追憶の書庫', 'ミッション', 'その他']);
  });
  it('先頭固定の月次項目(モンストの日)には見出しを付けず、英雄の神殿のpin行で見出しが重複しない', () => {
    state.events = ['英雄の神殿の特Lの園', '追憶の書庫で金卵2倍'].map((n, i) => ev(`g${i}#0`, 'campaign', t, e, { name: n }));
    state.monthly = MONTHLY;
    state.today = '2026-10-30';
    state.weekStart = '2026-10-28';
    render(root, state);
    const g = groups();
    expect(g.filter((x) => x === '英雄の神殿')).toHaveLength(1);
    expect(g[0]).toBe('英雄の神殿');
  });
  it('グループなしだけなら見出しなし。クエストの小見出しはクエストセクションだけ', () => {
    state.events = [ev('x#0', 'campaign', t, e, { name: '謎のキャンペーン' }), ev('q#0', 'event', t, e, { name: '覇者の塔' })];
    state.collapsed.clear();
    render(root, state);
    expect(groups()).toEqual(['定例クエスト']);
    expect(root.querySelectorAll('.g-group[data-group]')).toHaveLength(1); // 謎のキャンペーン(グループなし先頭)には見出しなし
  });
  it('畳んだセクションでは小見出しも出ない', () => {
    state.events = [ev('g#0', 'campaign', t, e, { name: '英雄の神殿の特Lの園' })];
    state.collapsed.add('campaign');
    render(root, state);
    expect(groups()).toEqual([]);
  });
});

describe('ラベルの欠落/句読点', () => {
  const N1 = '「英雄の神殿」で、チャンスバトルが必ず出現!';
  const N2 = '「英雄の神殿」の消費スタミナが「1/2」!「銭の間」は消費ゴールドが「1/2」に!';
  it('「必ず出現」まで残り、先頭の「、」や括弧は付かない', () => {
    expect(labelLines(N1)).toEqual({ title: '英雄の神殿', desc: 'チャンスバトルが必ず出現' });
    expect(fullLabel(N1)).toBe('英雄の神殿でチャンスバトルが必ず出現');
  });
  it('括弧内の「1/2」は日付と誤認せず中身を残す', () => {
    expect(labelLines(N2).desc).toBe('消費スタミナが1/2!銭の間は消費ゴールドが1/2に');
    expect(fullLabel(N2)).toBe('英雄の神殿の消費スタミナが1/2!銭の間は消費ゴールドが1/2に');
  });
  it('括弧の外の日付は従来どおり除く', () => {
    expect(shortLabel('10/30より新イベント開催!')).toBe('新イベント');
    expect(shortLabel('10/30(金)より新イベント開催!')).toBe('新イベント');
  });
});

describe('日別の時間帯', () => {
  const slots = [
    { start: '2026-10-30T08:00:00+09:00', end: '2026-10-30T09:00:00+09:00' },
    { start: '2026-10-30T12:00:00+09:00', end: '2026-10-30T13:00:00+09:00' },
    { start: '2026-11-04T11:00:00+09:00', end: '2026-11-04T12:00:00+09:00' },
  ];
  it('slotRows は日付ごとに時間帯をまとめる', () => {
    expect(slotRows(slots)).toEqual([
      { date: '10/30(金)', times: ['08:00〜09:00', '12:00〜13:00'] },
      { date: '11/04(水)', times: ['11:00〜12:00'] },
    ]);
  });
  it('バーは全体期間で1本、詳細パネルに日別の時間帯を表で出す。同ラベルの統合で枠は和集合', () => {
    const a = ev('s#0', 'event', '2026-10-30T00:00:00+09:00', '2026-11-04T23:59:00+09:00', { name: '「英雄の神殿」で、チャンスバトルが必ず出現!', slots });
    render(root, initialState('2026-10-30', [a], INDEX));
    expect(root.querySelectorAll('.bar-ev')).toHaveLength(1);
    click(bar('s#0'));
    const rows = [...(q('detail')?.querySelectorAll('[data-testid="detail-slots"] tbody tr') ?? [])].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
    expect(rows).toEqual([['10/30(金)', '08:00〜09:00', '12:00〜13:00'], ['11/04(水)', '11:00〜12:00', '']]);
    expect([...(q('detail')?.querySelectorAll('[data-testid="detail-slots"] th') ?? [])].map((c) => c.textContent)).toEqual(['日付', '①', '②']);
    const b = ev('s#1', 'event', '2026-11-01T00:00:00+09:00', '2026-11-05T23:59:00+09:00', { name: '「英雄の神殿」で、チャンスバトルが必ず出現!', slots: [slots[2] as (typeof slots)[0]] });
    expect(mergeSameLabel([a, b])[0]?.slots).toHaveLength(3);
  });
});

describe('update button', () => {
  it('is never shown', () => {
    expect(q('update')).toBeNull();
  });
});

describe('小見出しの位置とラベル', () => {
  const t = '2026-10-27T00:00:00+09:00';
  const e = '2026-10-28T23:59:00+09:00';
  it('小見出しは該当行の直前に置かれ(末尾に集まらない)、配下のラベルは説明のみ', () => {
    state.events = ['「英雄の神殿」で、チャンスバトルが必ず出現!', '追憶の書庫で金卵2倍', '謎のキャンペーン'].map((n, i) => ev(`p${i}#0`, 'campaign', t, e, { name: n }));
    render(root, state);
    const order = [...root.querySelectorAll('.g-inner .g-rows > .g-group, .g-inner .g-rows > .g-row')].map((x) => (x.classList.contains('g-group') ? `H:${x.textContent}` : `R:${x.querySelector('.g-l1')?.textContent}`));
    expect(order).toEqual(['H:英雄の神殿', 'R:チャンスバトルが必ず出現', 'H:追憶の書庫', 'R:金卵2倍', 'H:その他', 'R:謎のキャンペーン']);
    expect(root.querySelector('.g-l2')).toBeNull();
  });
});


describe('ガチャセクション', () => {
  const t = '2026-10-27T00:00:00+09:00';
  const e = '2026-10-28T23:59:00+09:00';
  it('gachaGroup: 定例/イベント(コラボ含む)/期間限定。コラボの付随項目・ガチャ以外は null', () => {
    expect(gachaGroup({ category: 'event', name: 'ガチャ「超・獣神祭」開催!' })).toBe('定例ガチャ');
    expect(gachaGroup({ category: 'event', name: 'ガチャ「モンコレDX 〜ビナー編〜」開催！' })).toBe('定例ガチャ'); // 定例の語で始まる派生は定例ガチャ
    expect(gachaGroup({ category: 'collab', name: 'ガチャ「呪術廻戦」開催!' })).toBe('イベントガチャ');
    expect(gachaGroup({ category: 'event', name: 'ガチャ「ギャラクシーアドベンチャー II」開催!', title: '新イベント「ギャラクシーアドベンチャー II」11/2より開催！' })).toBe('イベントガチャ');
    expect(gachaGroup({ category: 'event', name: 'ガチャ「モンスト夏休み2026」開催!', title: '期間限定イベント「モンスト夏休み2026」がスタート！' })).toBe('イベントガチャ');
    expect(gachaGroup({ category: 'collab', name: '「日替わり誠くんガチャ」開催!' })).toBeNull();
    expect(gachaGroup({ category: 'event', name: '「未開の砂宮」が登場！ミッションクリアで★6確定ガチャも！' })).toBeNull();
    expect(gachaGroup({ category: 'campaign', name: 'お得に引ける「10連ガチャ値引き券」登場!' })).toBeNull();
    expect(sectionOfEvent({ category: 'event', name: 'ガチャ「超・獣神祭」開催!' })?.id).toBe('gacha');
    expect(sectionOfEvent({ category: 'event', name: '覇者の塔' })?.id).toBe('quest');
    expect(sectionOf('collab')?.id).toBe('gacha'); // collab 記事の項目が選択候補に残る
    expect(sectionOfEvent({ category: 'collab', name: 'コラボクエストが登場!' })).toBeNull();
  });
  it('コラボのピックアップ: 作品名の行の直下にインデントして並ぶ(複数コラボが重なっても作品ごとにまとまる)。ラベルはピックアップ名のみ(「└」等の文字は付けずCSSでインデントと点)、ホバーは作品｜名。クエストの写しには出ない', () => {
    const main = (id: string, work: string, start: string) => ev(id, 'collab', start, '2026-11-09T11:59:00+09:00', { name: `ガチャ「${work}」開催!`, title: `【${work}×モンスト】` });
    const pick = (id: string, work: string, pname: string, order: number, s: string, e2: string, m: ExportEvent) =>
      ev(id, 'collab', s, e2, { name: `ガチャ「${work}｜${pname}」`, pickup: { name: pname, order, mainId: m.id } });
    const a = main('a#0', '作品A', '2026-11-02T12:00:00+09:00');
    const b = main('b#0', '作品B', '2026-11-03T12:00:00+09:00');
    state.events = [
      pick('b#1', '作品B', 'ビー1', 0, '2026-11-03T12:00:00+09:00', '2026-11-04T11:59:00+09:00', b),
      pick('a#2', '作品A', 'エー2', 1, '2026-11-03T12:00:00+09:00', '2026-11-04T11:59:00+09:00', a),
      pick('a#1', '作品A', 'エー1', 0, '2026-11-05T12:00:00+09:00', '2026-11-06T11:59:00+09:00', a),
      pick('a#3', '作品A', 'エー1', 0, '2026-11-02T12:00:00+09:00', '2026-11-03T11:59:00+09:00', a),
      b,
      a,
    ];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    const labels = [...root.querySelectorAll('.g-inner .g-rows > .g-row')].map((x) => x.querySelector('.g-l1')?.textContent);
    // 先頭の2行(作品A・作品B)はクエストの「イベントクエスト」への写し。ガチャセクションは末尾の5行
    expect(labels.slice(0, 2)).toEqual(['作品A', '作品B']);
    expect(labels.slice(2)).toEqual(['作品A', 'エー1', 'エー2', '作品B', 'ビー1']);
    const row = [...root.querySelectorAll<HTMLElement>('.g-row')].find((r) => r.querySelector('.g-l1')?.textContent === 'エー1') as HTMLElement;
    expect(row.querySelectorAll('.bar-ev')).toHaveLength(2); // 回ごとのバーが同じ行に並ぶ
    expect((row.querySelector('.g-label') as HTMLElement).title).toBe('作品A｜エー1');
    expect(row.querySelector('.g-label')?.classList.contains('pickup')).toBe(true);
    // イベントクエストの写しにはピックアップを含めない(作品の行だけが写る)
    expect(ganttSections(state.events, weekDays('2026-11-02')).find((g) => g.section.id === 'quest')?.rows.flat().filter((x) => x.event.name.includes('｜'))).toEqual([]);
  });

  it('同じ作品名の通常ガチャが同ラベル統合で開始が変わっても、作品の塊は崩れない(別作品が間に入らない)', () => {
    const early = ev('m#0', 'collab', '2026-11-02T12:00:00+09:00', '2026-11-03T11:59:00+09:00', { name: 'ガチャ「作品M」開催!' });
    const late = ev('m#9', 'collab', '2026-11-03T11:00:00+09:00', '2026-11-08T11:59:00+09:00', { name: 'ガチャ「作品M」開催!' });
    const other = ev('o#0', 'collab', '2026-11-03T00:00:00+09:00', '2026-11-08T11:59:00+09:00', { name: 'ガチャ「作品O」開催!' });
    const pick = (id: string, s: string, e2: string) => ev(id, 'collab', s, e2, { name: 'ガチャ「作品M｜ピ」', pickup: { name: 'ピ', order: 0, mainId: late.id } });
    state.events = [other, late, early, pick('m#1', '2026-11-04T12:00:00+09:00', '2026-11-05T11:59:00+09:00')];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    expect([...root.querySelectorAll('.g-inner .g-rows > .g-row .g-l1')].map((x) => x.textContent).slice(-3)).toEqual(['作品M', 'ピ', '作品O']);
  });

  it('ピックアップの公式色: ラベルとスケジュール表の対象名に --pc とクラス、バーは面は既定色のまま縁だけその色(edge-attr)。#rrggbb 以外は無視する', () => {
    const m = ev('c#0', 'collab', '2026-11-02T12:00:00+09:00', '2026-11-09T11:59:00+09:00', {
      name: 'ガチャ「作品C」開催!',
      details: [{ label: 'ガチャ開催スケジュール', lines: ['ユルピックアップ | 11/3 12:00〜11/4 11:59'], colors: { ユルピックアップ: '#a237c3' } }],
    });
    const p = (id: string, name: string, color: string | undefined) => ev(id, 'collab', '2026-11-03T12:00:00+09:00', '2026-11-04T11:59:00+09:00', { name: `ガチャ「作品C｜${name}」`, pickup: { name, order: 0, mainId: m.id, ...(color ? { color } : {}) } });
    state.events = [m, p('c#1', 'ユル', '#a237c3'), p('c#2', 'ワル', 'red; background:url(x)')];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    const row = (n: string) => [...root.querySelectorAll<HTMLElement>('.g-row')].find((r) => r.querySelector('.g-l1')?.textContent === n) as HTMLElement;
    const yuru = row('ユル');
    expect((yuru.querySelector('.g-label') as HTMLElement).style.getPropertyValue('--pc')).toBe('#a237c3');
    expect(yuru.querySelector('.g-label')?.classList.contains('colored')).toBe(true);
    // バーは色を変えず既定(ユーザ指示)
    expect(yuru.querySelector('.bar-ev')?.classList.contains('pickup-bar')).toBe(false);
    expect((yuru.querySelector('.bar-ev') as HTMLElement).style.getPropertyValue('--pc')).toBe('#a237c3'); // 縁の色(面は変えない)
    expect(yuru.querySelector('.bar-ev')?.classList.contains('edge-attr')).toBe(true);
    const wal = row('ワル');
    expect(wal.querySelector('.g-label')?.classList.contains('colored')).toBe(false);
    expect(wal.querySelector('.bar-ev')?.classList.contains('pickup-bar')).toBe(false);
    click(bar('c#0'));
    const cell = q('detail')?.querySelector('.sched-name') as HTMLElement;
    expect(cell.style.getPropertyValue('--pc')).toBe('#a237c3');
    expect(cell.classList.contains('colored')).toBe(true);
  });

  it('ピックアップのバーのクリック: そのピックアップの全期間を表(対象・期間)で出し、クリックした回の行を強調する。対象名は公式色', () => {
    const m = ev('d#0', 'collab', '2026-11-02T12:00:00+09:00', '2026-11-09T11:59:00+09:00', { name: 'ガチャ「作品E」開催!' });
    const lines = ['ユルピックアップ | 11/3 12:00〜11/4 11:59', 'ユルピックアップ | 11/6 12:00〜11/7 11:59'];
    const p = (id: string, s: string, e2: string) => ev(id, 'collab', s, e2, {
      name: 'ガチャ「作品E｜ユル」',
      pickup: { name: 'ユル', order: 0, mainId: m.id, color: '#a237c3' },
      details: [{ label: 'ピックアップスケジュール', lines, colors: { ユルピックアップ: '#a237c3' } }],
    });
    state.events = [m, p('d#1', '2026-11-03T12:00:00+09:00', '2026-11-04T11:59:00+09:00'), p('d#2', '2026-11-06T12:00:00+09:00', '2026-11-07T11:59:00+09:00')];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    click(bar('d#2'));
    const d = q('detail') as HTMLElement;
    const rows = [...d.querySelectorAll('.detail-block tbody tr')];
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent))).toEqual([['ユルピックアップ', '11/03 12:00〜11/04 11:59'], ['11/06 12:00〜11/07 11:59']]);
    expect(rows.map((r) => r.classList.contains('cur'))).toEqual([false, true]); // クリックした2回目だけ強調
    expect(d.querySelector('.sched-name')?.getAttribute('rowspan')).toBe('2');
    expect((d.querySelector('.sched-name') as HTMLElement).style.getPropertyValue('--pc')).toBe('#a237c3');
  });

  it('詳細の対象ステージ(禁忌)・階層クエスト(星墓)の名前に属性色を付ける。対応表に無い名前や他のブロックは色なし', () => {
    const e1 = ev('k#0', 'event', '2026-11-03T12:00:00+09:00', '2026-11-09T11:59:00+09:00', {
      name: '「禁忌の獄〜深淵〜」',
      details: [
        { label: '本開催の「禁忌の獄〜深淵〜」対象ステージ', lines: ['火獄の無量大数', '水獄の阿頼耶', '未知の名前'] },
        { label: 'メンテナンス内容', lines: ['火獄の説明'] },
      ],
    });
    const e2 = ev('s#0', 'event', '2026-11-03T12:00:00+09:00', '2026-11-09T11:59:00+09:00', {
      name: '「破界の星墓」',
      details: [{ label: '本開催の1階層～5階層までのクエスト', lines: ['1階層：パライソの星墓', '2階層：黄泉の星墓', '3階層：未知の星墓'] }],
    });
    state.events = [e1, e2];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    click(bar('k#0'));
    const lis = [...(q('detail')?.querySelectorAll('.detail-block li') ?? [])] as HTMLElement[];
    expect(lis.map((l) => [l.textContent, l.style.getPropertyValue('--pc')])).toEqual([['火獄の無量大数', '#eb0043'], ['水獄の阿頼耶', '#3154ef'], ['未知の名前', ''], ['火獄の説明', '']]);
    expect(lis[0]?.classList.contains('qname')).toBe(true);
    click(bar('s#0'));
    const cells = [...(q('detail')?.querySelectorAll('.detail-table tbody tr') ?? [])].map((r) => { const td = r.querySelectorAll('td')[1] as HTMLElement; return [td.textContent, td.style.getPropertyValue('--pc')]; });
    // 6〜10階層は固定で追加される。追加分にも属性色
    expect(cells).toEqual([
      ['パライソの星墓', '#007d32'], ['黄泉の星墓', '#a237c3'], ['未知の星墓', ''],
      ['ニギミタマの星墓', '#eb0043'], ['桃源郷の星墓', '#3154ef'], ['コキュートスの星墓', '#007d32'], ['ラルガメンテの星墓', '#a16800'], ['メラン&コリンの星墓', '#a237c3'],
    ]);
  });

  it('超究極・絶級のボス名の公式色: 行ラベルの文字とバーの縁(--pc とクラス)。#rrggbb 以外は無視', () => {
    const a = ev('b#0', 'event', '2026-11-03T12:00:00+09:00', '2026-11-09T11:59:00+09:00', { name: '超究極・兵クエスト（ミザリー）が出現', color: '#3154ef' });
    const b = ev('b#1', 'event', '2026-11-03T12:00:00+09:00', '2026-11-09T11:59:00+09:00', { name: '超究極・傑クエスト（ララバイ）が出現', color: 'expression(1)' });
    state.events = [a, b];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    const row = (id: string) => [...root.querySelectorAll<HTMLElement>('.g-row')].find((r) => r.querySelector(`.bar-ev[data-event-id="${id}"]`)) as HTMLElement;
    const la = row('b#0').querySelector('.g-label') as HTMLElement;
    expect(la.style.getPropertyValue('--pc')).toBe('#3154ef');
    expect(la.classList.contains('colored')).toBe(true);
    expect(la.classList.contains('pickup')).toBe(false);
    const barA = row('b#0').querySelector('.bar-ev') as HTMLElement;
    expect(barA.style.getPropertyValue('--pc')).toBe('#3154ef'); // バーの縁もラベルと同じ色
    expect(barA.classList.contains('edge-attr')).toBe(true);
    const lb = row('b#1').querySelector('.g-label') as HTMLElement;
    expect(lb.classList.contains('colored')).toBe(false);
  });

  it('ピックアップ名が長くて先頭24字が同じでも、別ピックアップは別の行になる', () => {
    const m = ev('l#0', 'collab', '2026-11-02T12:00:00+09:00', '2026-11-09T11:59:00+09:00', { name: 'ガチャ「とても長い作品名のコラボ」開催!' });
    const p = (id: string, n: string) => ev(id, 'collab', '2026-11-03T12:00:00+09:00', '2026-11-04T11:59:00+09:00', { name: `ガチャ「とても長い作品名のコラボ｜${n}」`, pickup: { name: n, order: 0, mainId: m.id } });
    state.events = [m, p('l#1', 'フリーレン＆ヒンメル'), p('l#2', 'フリーレン＆フェルン')];
    state.weekStart = '2026-11-02';
    state.collapsed.clear();
    render(root, state);
    expect([...root.querySelectorAll('.g-inner .g-rows > .g-row .g-l1')].map((x) => x.textContent).slice(-3)).toEqual(['とても長い作品名のコラボ', 'フリーレン＆ヒンメル', 'フリーレン＆フェルン']);
  });

  it('年代別のガチャ行(ガチャ「定例名 2013＆2014」)は定例ガチャ。同じ定例名の中で年代順、ラベルは「」の中身。「」の後に文が続く行も定例ガチャ。定例の語を含まない別のガチャは対象外', () => {
    const era = (y: string) => ({ category: 'event', name: `ガチャ「モンストジェネレーション ${y}」` });
    expect(gachaGroup(era('2013＆2014'))).toBe('定例ガチャ');
    expect(gachaGroup(era('2019'))).toBe('定例ガチャ');
    expect(gachaGroup({ category: 'event', name: 'ガチャ「モンストジェネレーション 2019」開催！「媽祖」の排出確率超UP！' })).toBe('定例ガチャ'); // 派生(続きのある行)も定例ガチャ
    expect(gachaGroup({ category: 'event', name: 'ガチャ「未知のガチャ 2019」' })).toBe('期間限定ガチャ');
    expect(gachaGroup({ category: 'event', name: 'ガチャ「モンコレDX Vol.1」' })).toBe('定例ガチャ');
    // Vol 別の行も Vol 順(登場順に関わらず)
    state.events = ['Vol.3', 'Vol.1', 'Vol.2'].map((v, i) => ev(`v${i}#0`, 'event', t, e, { name: `ガチャ「モンコレDX ${v}」` }));
    state.collapsed.clear();
    render(root, state);
    expect([...root.querySelectorAll('.g-inner .g-rows > .g-row')].map((x) => x.querySelector('.g-l1')?.textContent)).toEqual(['モンコレDX Vol.1', 'モンコレDX Vol.2', 'モンコレDX Vol.3']);
    const names = ['2019', '2013＆2014', '2016', '2015'];
    state.events = [...names.map((y, i) => ev(`e${i}#0`, 'event', t, e, era(y))), ev('r#0', 'event', t, e, { name: 'ガチャ「RED STARS」開催！' })];
    state.collapsed.clear();
    render(root, state);
    const rows = [...root.querySelectorAll('.g-inner .g-rows > .g-row')].map((x) => x.querySelector('.g-l1')?.textContent);
    expect(rows.filter((x) => x?.startsWith('モンストジェネ'))).toEqual(['モンストジェネレーション 2013＆2014', 'モンストジェネレーション 2015', 'モンストジェネレーション 2016', 'モンストジェネレーション 2019']);
    expect(rows.indexOf('RED STARS')).toBeLessThan(rows.indexOf('モンストジェネレーション 2013＆2014'));
  });
  it('クエストの小見出しは イベントクエスト→定例クエスト→絶級→…。小見出し内の並びは従来どおり', () => {
    const e2 = '2026-11-09T11:59:00+09:00';
    state.events = [
      ev('q#0', 'event', t, e2, { name: '覇者の塔' }),
      ev('q#1', 'event', t, e2, { name: '禁忌の獄' }),
      ev('g#0', 'event', t, e2, { name: 'ガチャ「ギャラクシーアドベンチャー II」開催!', title: '新イベント「ギャラクシーアドベンチャー II」11/2より開催！' }),
      ev('q#2', 'event', t, e2, { name: '黎絶 キャローネ降臨' }),
    ];
    state.collapsed.clear();
    render(root, state);
    const heads = [...root.querySelectorAll('.g-inner .g-rows > .g-group')].map((x) => x.textContent);
    expect(heads.slice(0, 3)).toEqual(['イベントクエスト', '定例クエスト', '絶級クエスト']);
  });
  it('小見出しは イベント(通常→コラボ)→定例→期間限定。定例は設定の語順、行ラベルはガチャ名のみ。イベントガチャはクエストのイベントクエストにも写る', () => {
    const names: [string, string, string][] = [
      ['event', 'ガチャ「集結、天下五剣」開催!', 'ガチャ「集結、天下五剣」10/1より開催！'],
      ['event', 'ガチャ「あいうえお」開催!', 'x'],
      ['event', 'ガチャ「モンコレDX 〜ビナー編〜」開催！', 'x'],
      ['event', 'ガチャ「モンストジェネレーション」開催！', 'x'],
      ['event', 'ガチャ「モンコレDX」開催！', 'x'],
      ['event', 'ガチャ「オリエンタル・トラベラーズ」開催！', 'x'],
      ['event', 'ガチャ「ミッドナイト・パーティー」開催！', 'x'],
      ['collab', 'ガチャ「黄泉のツガイ」開催!', '【黄泉のツガイ×モンスト】コラボイベント'],
      ['event', 'ガチャ「ギャラクシーアドベンチャー II」開催!', '新イベント「ギャラクシーアドベンチャー II」11/2より開催！'],
      ['event', 'ガチャ「水の遊宴」開催！', 'x'],
      ['event', 'ガチャ「RED STARS」開催！', 'x'],
      ['event', 'ガチャ「激・獣神祭」開催!', 'x'],
      ['event', 'ガチャ「超・獣神祭」開催!', 'x'],
    ];
    state.events = names.map(([c, n, title], i) => ev(`g${i}#0`, c, t, e, { name: n, title }));
    state.collapsed.clear();
    render(root, state);
    const order = [...root.querySelectorAll('.g-inner .g-rows > .g-group, .g-inner .g-rows > .g-row')].map((x) => (x.classList.contains('g-group') ? `H:${x.textContent}` : `R:${x.querySelector('.g-l1')?.textContent}`));
    expect(order).toEqual(['H:イベントクエスト', 'R:ギャラクシーアドベンチャー II', 'R:黄泉のツガイ', 'H:イベントガチャ', 'R:ギャラクシーアドベンチャー II', 'R:黄泉のツガイ', 'H:定例ガチャ', 'R:超・獣神祭', 'R:激・獣神祭', 'R:RED STARS', 'R:水の遊宴', 'R:ミッドナイト・パーティー', 'R:オリエンタル・トラベラーズ', 'R:モンコレDX', 'R:モンコレDX 〜ビナー編〜', 'R:モンストジェネレーション', 'H:期間限定ガチャ', 'R:集結、天下五剣', 'R:あいうえお']);
  });

  it('期間限定ガチャは日程(開始)順に並ぶ(名前順ではない。開始が同じなら記事・項目の順)', () => {
    const mk = (id: string, name: string, start: string) => ev(id, 'event', start, '2026-11-09T11:59:00+09:00', { name: `ガチャ「${name}」開催!`, title: 'x' });
    state.weekStart = '2026-11-05';
    state.events = [mk('a#0', 'あ後のガチャ', '2026-11-07T12:00:00+09:00'), mk('b#0', 'わ先のガチャ', '2026-11-05T12:00:00+09:00'), mk('c#0', 'い中のガチャ', '2026-11-06T12:00:00+09:00')];
    state.collapsed.clear();
    render(root, state);
    const rows = [...root.querySelectorAll('.g-inner .g-rows > .g-row')].map((x) => x.querySelector('.g-l1')?.textContent);
    expect(rows).toEqual(['わ先のガチャ', 'い中のガチャ', 'あ後のガチャ']);
  });

  it('期間限定クエストの行ラベルから「期間限定クエスト」を取り除く(括弧だけ残るときは中身を使う。取り除くと空なら元のまま)', () => {
    const lab = (name: string) => rowLabel('quest', { name, group: '期間限定クエスト' });
    expect(lab('期間限定クエスト「ユククル」登場!').l1).toBe('ユククル');
    expect(lab('期間限定クエスト（ユーフリィム）が再登場！').l1).toBe('ユーフリィム');
    expect(lab('期間限定クエスト登場!').l1).toBe('期間限定クエスト');
    expect(lab('DREAMDAZE IV開催記念クエストあゆむ').l1).toBe('DREAMDAZE IV開催記念クエストあゆむ');
    // 他の小見出し・セクションは変えない
    expect(rowLabel('quest', { name: '覇者の塔', group: '定例クエスト' }).l1).toBe('覇者の塔');
  });

  it('isOnCalendarDay: 翌4:00終了のイベントは終了日の暦日(バーの列)にもかかる', () => {
    const e = { start: '2026-10-28T12:00:00+09:00', end: '2026-10-29T04:00:00+09:00' };
    expect([isOnCalendarDay(e, '2026-10-28'), isOnCalendarDay(e, '2026-10-29'), isOnCalendarDay(e, '2026-10-30')]).toEqual([true, true, false]);
  });

  it('イベントクエスト行のバー(ガチャの写し)を押しても詳細が出る', () => {
    const g = ev('g#0', 'event', '2026-10-27T12:00:00+09:00', '2026-10-29T04:00:00+09:00', { name: 'ガチャ「ギャラクシーアドベンチャー II」開催!', title: '新イベント「ギャラクシーアドベンチャー II」より開催！' });
    state = initialState('2026-10-27', [g], INDEX);
    state.collapsed = new Set(); // 他テストの折りたたみ状態に左右されない
    render(root, state);
    const b = bar('g#0~event');
    expect(b).not.toBeNull();
    click(b);
    expect(q('detail')?.textContent).not.toContain('この日のイベントはありません');
    expect(q('detail')?.querySelector('h3')?.textContent).toBe('ギャラクシーアドベンチャー II'); // 行ラベルと同じ。「ガチャ」は付けない
  });

  it('periodText: 年をまたぐ場合だけ年を付ける。hide_start / hide_end', () => {
    expect(periodText({ start: '2026-10-27T12:00:00+09:00', end: '2026-10-29T11:59:00+09:00' })).toBe('10/27(火) 12:00 〜 10/29(木) 11:59');
    expect(periodText({ start: '2026-12-31T12:00:00+09:00', end: '2027-01-05T11:59:00+09:00' })).toBe('2026/12/31(木) 12:00 〜 2027/01/05(火) 11:59');
    expect(periodText({ start: '2026-12-31T12:00:00+09:00', end: null })).toBe('12/31(木) 12:00 〜 終了未定');
    const p = { start: '2026-12-31T12:00:00+09:00', end: '2027-01-05T11:59:00+09:00' };
    expect(periodText({ ...p, hide_start: true })).toBe('〜 2027/01/05(火) 11:59');
    expect(periodText({ ...p, hide_end: true })).toBe('2026/12/31(木) 12:00 〜');
    expect(periodText({ ...p, hide_start: true, hide_end: true })).toBe('');
  });

  it('両方 hide の項目は詳細に開催期間の行を出さない', () => {
    const h = ev('h#0', 'event', '2026-10-27T00:00:00+09:00', '2026-12-31T23:59:00+09:00', { name: '歴戦の跡地', hide_start: true, hide_end: true });
    state = initialState('2026-10-27', [h], INDEX);
    state.collapsed = new Set();
    render(root, state);
    click(bar('h#0'));
    expect(q('detail')?.textContent).toContain('歴戦の跡地');
    expect(q('detail')?.textContent).not.toContain('開催期間');
    expect(bar('h#0').title).toBe('歴戦の跡地');
  });

  it('メンテナンスの帯を押しても詳細は1件だけ', () => {
    const m = ev('m#0', 'maintenance', '2026-10-27T00:00:00+09:00', '2026-10-27T05:00:00+09:00', { name: 'メンテナンス' });
    state = initialState('2026-10-27', [m], INDEX);
    render(root, state);
    click(root.querySelector('.g-maint'));
    expect(q('detail')?.querySelectorAll('.detail-item')).toHaveLength(1);
  });
});

describe('小見出しの開閉', () => {
  // ガチャに畳めない新限定は「期間限定ガチャ」の小見出しの行として残る
  const chara = (id: string, kind: '新限定' | '獣神化・改', name: string, day: string): ExportEvent =>
    ev(id, 'character', `${day}T00:00:00+09:00`, `${day.slice(0, 8)}${String(Number(day.slice(8)) + 1).padStart(2, '0')}T00:00:00+09:00`, { name, character: { kind } });
  const evs = [chara('x#c0', '新限定', 'A（G）', '2026-10-27'), chara('x#c1', '獣神化・改', 'B（獣神化・改）', '2026-10-28'), chara('x#c2', '獣神化・改', 'C（獣神化・改）', '2026-10-29')];
  const groupBtn = (g: string) => [...root.querySelectorAll<HTMLElement>('.g-group')].find((x) => x.dataset.group === g) as HTMLElement;
  const rowsOf = () => root.querySelectorAll('.g-row:not(.g-dates) .g-label').length;
  beforeEach(() => {
    state = initialState('2026-10-27', evs, INDEX);
    state.collapsed.clear();
    render(root, state);
  });

  it('小見出しを押すとその小見出しの行だけ畳まれ、件数が出る。もう一度で開く', () => {
    expect(rowsOf()).toBe(3);
    click(groupBtn('進化'));
    expect(rowsOf()).toBe(1);
    expect(groupBtn('進化').textContent).toBe('進化(2)');
    expect(groupBtn('進化').getAttribute('aria-expanded')).toBe('false');
    expect(groupBtn('期間限定ガチャ').getAttribute('aria-expanded')).toBe('true');
    click(groupBtn('進化'));
    expect(rowsOf()).toBe(3);
    expect(groupBtn('進化').textContent).toBe('進化');
  });

  it('セクションを畳んで開いても、小見出しの畳みは保たれる。キーボード(Enter)でも開閉できる', () => {
    groupBtn('期間限定ガチャ').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(rowsOf()).toBe(2);
    click(root.querySelector('.g-section'));
    click(root.querySelector('.g-section'));
    expect(rowsOf()).toBe(2);
    expect(groupBtn('期間限定ガチャ').getAttribute('aria-expanded')).toBe('false');
  });
});

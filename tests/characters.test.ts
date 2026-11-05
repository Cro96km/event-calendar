import { describe, expect, it } from 'vitest';
import { characterLabel, CHARACTER_CATEGORY, gachaPeriod, gameDayEnd, parseCharacters } from '../src/characters';
import { buildExport } from '../src/data/export';
import type { ArticleRecord } from '../src/data/record';
import { applySelection } from '../src/selection';
import { sectionOfEvent, SECTIONS } from '../src/sections';
import { ganttSections } from '../src/week';

// 公式の本文そのものではなく、構造(見出し→▼解禁日時→日時)だけを写した最小の入力
const evolutionLines = [
  '「キスキル」の真獣神化、「オフィ」「桜」の獣神化・改が可能になります！',
  '# 真獣神化「キスキル」',
  '光属性 ★6',
  '▼解禁日時',
  '2026年2月11日（水）22:00',
  '▼必要素材',
  '# 動画&プロフィール',
  '# 獣神化・改「オフィ」',
  '▼解禁日時',
  '2026年2月15日（日）12:00',
  '# 獣神化・改「桜」',
  '▼解禁日時',
  '2026年2月17日（火）12:00',
  '# 漫画家描き下ろしデザインの「桜」も登場！',
  '▼解禁日時',
  '2026年2月17日（火）12:00',
];

describe('parseCharacters 進化の解禁', () => {
  it('見出しごとに名前・種別・解禁日時を取り、バーは解禁日のゲーム日1日分(翌4:00まで)', () => {
    const r = parseCharacters({ title: '「キスキル」の真獣神化＆「桜」等3体の獣神化・改が解禁！', lines: evolutionLines }, null);
    expect(r).toEqual([
      { name: 'キスキル', kind: '真獣神化', start: '2026-02-11T22:00:00+09:00', end: '2026-02-12T04:00:00+09:00' },
      { name: 'オフィ', kind: '獣神化・改', start: '2026-02-15T12:00:00+09:00', end: '2026-02-16T04:00:00+09:00' },
      { name: '桜', kind: '獣神化・改', start: '2026-02-17T12:00:00+09:00', end: '2026-02-18T04:00:00+09:00' },
    ]);
  });

  it('全員に共通の ▼解禁日時 が最初の見出しより前にある形', () => {
    const lines = ['▼解禁日時', '2025年11月18日（火）12:00', '# 獣神化・改「A」', '木属性 ★6', '# 獣神化・改「B」', '光属性 ★6'];
    const r = parseCharacters({ title: '「A」「B」の獣神化・改が11/18に解禁！', lines }, null);
    expect(r.map((c) => [c.name, c.start])).toEqual([['A', '2025-11-18T12:00:00+09:00'], ['B', '2025-11-18T12:00:00+09:00']]);
  });

  it('1つの見出しに複数の名前(日時は共通)・見出しごとに別の日時', () => {
    const lines = ['# 獣神化・改「ポラリス」', '▼解禁日時', '2026年7月13日（月）12:00', '# 真獣神化「X」「XX」', '▼解禁日時', '2026年7月17日（金）12:00'];
    const r = parseCharacters({ title: 't', lines }, null);
    expect(r.map((c) => [c.name, c.kind, c.start.slice(0, 10)])).toEqual([
      ['ポラリス', '獣神化・改', '2026-07-13'],
      ['X', '真獣神化', '2026-07-17'],
      ['XX', '真獣神化', '2026-07-17'],
    ]);
  });

  it('見出しが無い1体だけの記事は、名前をタイトルから・日時を唯一の ▼解禁日時 から', () => {
    const r = parseCharacters({ title: '「コロンブス」の獣神化・改が1/20に解禁！', lines: ['▼解禁日時', '2026年1月20日（火）12:00', '▼必要素材'] }, null);
    expect(r).toEqual([{ name: 'コロンブス', kind: '獣神化・改', start: '2026-01-20T12:00:00+09:00', end: '2026-01-21T04:00:00+09:00' }]);
  });

  it('見出しが無く日時が複数ある記事は作らない(どの日時か分からない)', () => {
    const lines = ['▼解禁日時', '2026年1月20日（火）12:00', '▼解禁日時', '2026年1月21日（水）12:00'];
    expect(parseCharacters({ title: '「A」の獣神化・改が解禁！', lines }, null)).toEqual([]);
  });

  it('「獣神化・改記念キャンペーン」のような見出しは名前として扱わない', () => {
    expect(parseCharacters({ title: 't', lines: ['# 獣神化・改記念キャンペーン開催！', '▼解禁日時', '2026年7月12日（日）22:00'] }, null)).toEqual([]);
  });

  it('日時が取れない見出しは作らない(推測しない)', () => {
    expect(parseCharacters({ title: 't', lines: ['# 獣神化・改「桜」', '▼解禁日時', '近日'] }, null)).toEqual([]);
  });

  it('0:00〜3:59 の解禁は前日のゲーム日に属する', () => {
    const ms = Date.parse('2026-02-11T02:00:00+09:00');
    expect(gameDayEnd(ms)).toBe(Date.parse('2026-02-11T04:00:00+09:00'));
  });

  it('見出しの形でない「獣神化」(クエストの報酬など)は対象外', () => {
    expect(parseCharacters({ title: '超究極クエスト（大黒天）が登場！クリアで獣神化が解放！', lines: ['クリアで獣神化が解放！'] }, null)).toEqual([]);
  });
});

describe('parseCharacters 新限定', () => {
  const period = { start: '2026-08-08T12:00:00+09:00', end: '2026-08-10T11:59:00+09:00' };
  it('タイトルに名前があればそれを使い、期間はガチャの期間', () => {
    expect(parseCharacters({ title: 'ガチャ「G」に新限定キャラ「アガ」初登場！', lines: [] }, period)).toEqual([{ name: 'アガ', kind: '新限定', ...period }]);
  });
  it('タイトルに名前が無ければ本文の「新限定キャラクター「A」「B」」から補う', () => {
    const r = parseCharacters({ title: 'ガチャの新限定キャラ2体が登場！', lines: ['ガチャの新限定キャラクター「カーミラ」「ツクモ」が初登場！'] }, period);
    expect(r.map((c) => c.name)).toEqual(['カーミラ', 'ツクモ']);
  });
  it('タイトルに「新限定」が無い記事(本文で触れるだけ)は作らない', () => {
    expect(parseCharacters({ title: 'ガチャ再登場！', lines: ['新限定キャラクター「カーミラ」が排出対象'] }, period)).toEqual([]);
  });
  it('主期間が無ければ作らない', () => {
    expect(parseCharacters({ title: '新限定キャラ「A」', lines: [] }, null)).toEqual([]);
  });
});

const record = (over: Partial<ArticleRecord>): ArticleRecord => ({
  id: '20260211_4', url: 'https://example.invalid/20260211_4.html', title: '進化', category: 'update', categories: ['update'], published: '2026-02-11',
  fetched_at: '2026-02-11T00:00:00+09:00', lastmod: null, content_hash: 'sha256:x', parse_status: 'none', events: [], reward_until: null, ...over,
});

describe('キャラクターの出力と表示', () => {
  const rec = record({ characters: [{ name: '桜', kind: '獣神化・改', start: '2026-02-17T12:00:00+09:00', end: '2026-02-18T04:00:00+09:00' }] });

  it('期間なし(none)の記事でも、キャラクターは行になる。カテゴリは character', () => {
    const { months } = buildExport([rec], '2026-02-17T00:00:00+09:00');
    const e = months.flatMap((m) => m.events)[0];
    expect(e).toMatchObject({ id: '20260211_4#c0', name: characterLabel({ name: '桜', kind: '獣神化・改' }), category: CHARACTER_CATEGORY, start: '2026-02-17T12:00:00+09:00' });
  });

  it('選択(表示/非表示の判断)の対象外で常に表示。キャラクターのセクションに入り、クエストより上に並ぶ', () => {
    const events = applySelection(buildExport([rec], 'x').months.flatMap((m) => m.events), { generated_at: 'x', selected: [], total: 0 });
    expect(events).toHaveLength(1);
    expect(sectionOfEvent(events[0]!)?.id).toBe('character');
    expect(SECTIONS[0]?.id).toBe('character');
    const days = ['2026-02-16', '2026-02-17', '2026-02-18'];
    const g = ganttSections(events, days);
    expect(g.map((x) => x.section.id)).toEqual(['character']);
    expect(g[0]?.rows).toHaveLength(1);
  });

  it('名前に「ガチャ」を含んでもガチャのセクションに入らない', () => {
    const ev = buildExport([record({ characters: [{ name: 'ガチャ丸', kind: '獣神化', start: '2026-02-17T12:00:00+09:00', end: '2026-02-18T04:00:00+09:00' }] })], 'x').months[0]!.events[0]!;
    expect(sectionOfEvent(ev)?.id).toBe('character');
  });

  it('1キャラ1行: 同じ週の別のキャラは別の行になる', () => {
    const r2 = record({ characters: [
      { name: 'A', kind: '獣神化・改', start: '2026-02-17T12:00:00+09:00', end: '2026-02-18T04:00:00+09:00' },
      { name: 'B', kind: '真獣神化', start: '2026-02-17T12:00:00+09:00', end: '2026-02-18T04:00:00+09:00' },
    ] });
    const events = buildExport([r2], 'x').months.flatMap((m) => m.events);
    expect(ganttSections(events, ['2026-02-17'])[0]?.rows).toHaveLength(2);
  });
});

describe('gachaPeriod', () => {
  const ev = (name: string, start: string) => ({ name, start, end: null });
  it('ガチャの開催期間を優先し(先行販売などが先頭でも)、無ければ最初の項目', () => {
    expect(gachaPeriod([ev('編成するとBGMが変更', 'a'), ev('ガチャ「超・獣神祭」開催!', 'b'), ev('先行販売', 'c')])?.start).toBe('b');
    expect(gachaPeriod([ev('X', 'a'), ev('Y', 'b')])?.start).toBe('a');
    expect(gachaPeriod([])).toBeNull();
  });
});

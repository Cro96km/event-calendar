import { describe, expect, it } from 'vitest';
import { applyGachaAlias, attributeColor, calendarDay, gachaAlias, characterLabel, CHARACTER_CATEGORY, gachaPeriod, parseCharacters, regularGachaName } from '../src/characters';
import { buildExport } from '../src/data/export';
import type { ArticleRecord } from '../src/data/record';
import { applySelection } from '../src/selection';
import { gachaGroup, regularGachaIndex, sectionOfEvent, SECTIONS } from '../src/sections';
import { ganttSections, periodText, unlockText, whenText } from '../src/week';

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
  '水属性 ★6',
  '▼解禁日時',
  '2026年2月15日（日）12:00',
  '# 獣神化・改「桜」',
  '闇属性 ★6',
  '▼解禁日時',
  '2026年2月17日（火）12:00',
  '# 漫画家描き下ろしデザインの「桜」も登場！',
  '▼解禁日時',
  '2026年2月17日（火）12:00',
];

describe('parseCharacters 進化の解禁', () => {
  it('見出しごとに名前・種別・解禁日時・属性を取り、バーは解禁日の暦日1日分(罫線から罫線まで)。解禁の日時は at', () => {
    const r = parseCharacters({ title: '「キスキル」の真獣神化＆「桜」等3体の獣神化・改が解禁！', lines: evolutionLines }, null);
    expect(r).toEqual([
      { name: 'キスキル', kind: '真獣神化', start: '2026-02-11T00:00:00+09:00', end: '2026-02-12T00:00:00+09:00', at: '2026-02-11T22:00:00+09:00', attr: '光' },
      { name: 'オフィ', kind: '獣神化・改', start: '2026-02-15T00:00:00+09:00', end: '2026-02-16T00:00:00+09:00', at: '2026-02-15T12:00:00+09:00', attr: '水' },
      { name: '桜', kind: '獣神化・改', start: '2026-02-17T00:00:00+09:00', end: '2026-02-18T00:00:00+09:00', at: '2026-02-17T12:00:00+09:00', attr: '闇' },
    ]);
  });

  it('全員に共通の ▼解禁日時 が最初の見出しより前にある形', () => {
    const lines = ['▼解禁日時', '2025年11月18日（火）12:00', '# 獣神化・改「A」', '木属性 ★6', '# 獣神化・改「B」', '光属性 ★6'];
    const r = parseCharacters({ title: '「A」「B」の獣神化・改が11/18に解禁！', lines }, null);
    expect(r.map((c) => [c.name, c.start])).toEqual([['A', '2025-11-18T00:00:00+09:00'], ['B', '2025-11-18T00:00:00+09:00']]);
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
    expect(r).toEqual([{ name: 'コロンブス', kind: '獣神化・改', start: '2026-01-20T00:00:00+09:00', end: '2026-01-21T00:00:00+09:00', at: '2026-01-20T12:00:00+09:00' }]);
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

  it('バーは暦日(0:00〜翌0:00)。0:00〜3:59 の解禁もその暦日', () => {
    const ms = Date.parse('2026-02-11T02:00:00+09:00');
    expect(calendarDay(ms)).toEqual({ start: Date.parse('2026-02-11T00:00:00+09:00'), end: Date.parse('2026-02-12T00:00:00+09:00') });
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

  it('選択(表示/非表示の判断)の対象外で常に表示。キャラクター・ガチャのセクション(id gacha)に入り、クエスト・キャンペーンの下に並ぶ', () => {
    const events = applySelection(buildExport([rec], 'x').months.flatMap((m) => m.events), { generated_at: 'x', selected: [], total: 0 });
    expect(events).toHaveLength(1);
    expect(sectionOfEvent(events[0]!)?.id).toBe('gacha');
    expect(SECTIONS.map((s) => s.id)).toEqual(['quest', 'campaign', 'gacha']);
    expect(SECTIONS[2]?.label).toBe('キャラクター・ガチャ');
    const days = ['2026-02-16', '2026-02-17', '2026-02-18'];
    const g = ganttSections(events, days);
    expect(g.map((x) => x.section.id)).toEqual(['gacha']);
    expect(g[0]?.rows).toHaveLength(1);
  });

  it('名前に「ガチャ」を含む進化も、小見出し「進化」に入る(ガチャの小見出しと取り違えない)', () => {
    const ev = buildExport([record({ characters: [{ name: 'ガチャ丸', kind: '獣神化', start: '2026-02-17T12:00:00+09:00', end: '2026-02-18T04:00:00+09:00' }] })], 'x').months[0]!.events[0]!;
    expect(sectionOfEvent(ev)?.id).toBe('gacha');
    expect(gachaGroup(ev)).toBe('進化');
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

describe('属性・実装ガチャ名・ラベル・色', () => {
  it('名前の括弧は中身ごと完全に消す(末尾以外も)', () => {
    const r = parseCharacters({ title: '新限定「A（あ）B」', lines: ['新限定キャラクター「A（あ）B」「C(c)」が登場'] }, { start: 's', end: 'e' });
    expect(r.map((c) => c.name)).toEqual(['AB', 'C']);
  });

  it('実装ガチャ名: 定例ガチャの語を含むガチャ名はその定例名(新春!特別おまけ付き 超・獣神祭 → 超・獣神祭)', () => {
    expect(regularGachaName('新春!特別おまけ付き 超・獣神祭', [], ['超・獣神祭', '激・獣神祭'])).toBe('超・獣神祭');
  });
  it('実装ガチャ名: 本文に「ガチャ「X」は、「定例名」の限定キャラクターを含む」とあれば定例名。無ければガチャ名のまま', () => {
    const lines = ['ガチャ「Ultra LIVE!!」は、「グリーンファンタジー」の限定キャラクターを含む木属性キャラクターが排出対象！'];
    expect(regularGachaName('Ultra LIVE!!', lines, ['グリーンファンタジー'])).toBe('グリーンファンタジー');
    expect(regularGachaName('Other LIVE!!', lines, ['グリーンファンタジー'])).toBe('Other LIVE!!');
    expect(regularGachaName('Ultra LIVE!!', ['ガチャ「Ultra LIVE!!」は、「グリーンファンタジー」の限定キャラクターも'], [])).toBe('Ultra LIVE!!');
  });
  it('parseCharacters は、定例ガチャの名前を実装ガチャ名にする', () => {
    const r = parseCharacters({ title: '新限定「A」', lines: ['ガチャ「X LIVE」は、「RED STARS」の限定キャラクターを含む'] }, { start: 's', end: 'e', gacha: 'X LIVE' }, ['RED STARS']);
    expect(r[0]?.gacha).toBe('RED STARS');
  });

  it('名前の末尾の読み仮名の括弧は外す', () => {
    const lines = ['新限定キャラクター「東方萌萌美人（オリエンタルキューティー）」が登場', '光属性 ★6', '東方萌萌美人'];
    const r = parseCharacters({ title: '新限定「東方萌萌美人（オリエンタルキューティー）」登場', lines }, { start: 's', end: 'e', gacha: 'G' });
    expect(r.map((c) => [c.name, c.attr])).toEqual([['東方萌萌美人', '光']]);
  });

  it('進化: 見出しの後の `X属性` を取る(1つの見出しに複数の名前なら、名前を含む行の属性)', () => {
    const lines = ['# 獣神化・改「ポラリス」「ムー」', '▼解禁日時', '2026年7月13日（月）12:00', '木属性 ★6', '星の二つ名 ポラリス', '闇属性 ★6', '夢の二つ名 ムー'];
    const r = parseCharacters({ title: 't', lines }, null);
    expect(r.map((c) => [c.name, c.attr])).toEqual([['ポラリス', '木'], ['ムー', '闇']]);
  });

  it('新限定: `X属性` の次の行が名前のものを属性にし、実装ガチャ名を持つ', () => {
    const lines = ['新限定キャラクター「カーミラ」「ツクモ」が登場', '火属性 ★6', 'カーミラ', '木属性 ★6', 'ツクモ'];
    const r = parseCharacters({ title: 'ガチャの新限定キャラ2体が登場！', lines }, { start: 's', end: 'e', gacha: '彩・獣神祭' });
    expect(r.map((c) => [c.name, c.attr, c.gacha])).toEqual([['カーミラ', '火', '彩・獣神祭'], ['ツクモ', '木', '彩・獣神祭']]);
  });

  it('gachaPeriod はガチャ名も返す', () => {
    expect(gachaPeriod([{ name: 'モンストアニメ!ガチャ「新春 超・獣神祭」開催!', start: 'a', end: 'b' }])).toEqual({ start: 'a', end: 'b', gacha: '新春 超・獣神祭' });
  });

  it('ラベル: 新限定=名前（ガチャ名）、進化=名前（種別）', () => {
    expect(characterLabel({ name: 'カーミラ', kind: '新限定', gacha: '彩・獣神祭' })).toBe('カーミラ（彩・獣神祭）');
    expect(characterLabel({ name: '桜', kind: '獣神化・改' })).toBe('桜（獣神化・改）');
  });

  it('属性色は公式の属性色(火=赤・水=青・木=緑・光=黄・闇=紫)', () => {
    expect(attributeColor('火')).toBe('#eb0043');
    expect(attributeColor('闇')).toBe('#a237c3');
    expect(attributeColor(undefined)).toBeUndefined();
  });
});

describe('キャラクターの小見出し・並び・詳細', () => {
  const evo = (name: string, at: string, attr?: '火') => ({ name, kind: '獣神化・改' as const, start: `${at.slice(0, 10)}T00:00:00+09:00`, end: `${at.slice(0, 10)}T23:59:00+09:00`, at, ...(attr ? { attr } : {}) });
  const rec = record({
    id: '20260301_1',
    characters: [
      evo('後', '2026-03-03T12:00:00+09:00'),
      evo('同日の夜', '2026-03-02T22:00:00+09:00'),
      evo('同日の昼', '2026-03-02T12:00:00+09:00', '火'),
      { name: 'ガチャ組', kind: '新限定', start: '2026-03-02T12:00:00+09:00', end: '2026-03-05T11:59:00+09:00', gacha: '超・獣神祭' },
    ],
  });
  const events = buildExport([rec], 'x').months.flatMap((m) => m.events);
  const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'];

  it('小見出し「進化」が先頭(登場順。同じ日は解禁の時刻順)。ガチャに畳めない新限定は、期間限定ガチャの小見出しの行として残る', () => {
    const g = ganttSections(events, days)[0]!;
    const names = g.rows.map((r) => r[0]!.event.name);
    expect(names).toEqual(['同日の昼（獣神化・改）', '同日の夜（獣神化・改）', '後（獣神化・改）', 'ガチャ組（超・獣神祭）']);
    expect(g.rows.map((r) => gachaGroup(r[0]!.event))).toEqual(['進化', '進化', '進化', '期間限定ガチャ']);
  });

  it('進化のバーは解禁日の1日分(列の左端から右端まで)', () => {
    const e = events.find((x) => x.name.startsWith('同日の昼'))!;
    const b = ganttSections([e], days)[0]!.rows[0]![0]!;
    expect([b.from, b.to, b.startFrac]).toEqual([1, 1, 0]);
  });

  it('進化は開催期間を出さず、解禁の日時(12:00・22:00)を出す。新限定は開催期間のまま', () => {
    const e = events.find((x) => x.name.startsWith('同日の夜'))!;
    expect(periodText(e)).toBe('');
    expect(unlockText(e)).toContain('22:00');
    expect(whenText(e)).toMatch(/^解禁 .*22:00$/);
    const n = events.find((x) => x.name.startsWith('ガチャ組'))!;
    expect(unlockText(n)).toBe('');
    expect(whenText(n)).toContain('〜');
  });

  it('属性色がラベルの色(color)になる。属性が取れなければ色なし', () => {
    expect(events.find((x) => x.name.startsWith('同日の昼'))?.color).toBe('#eb0043');
    expect(events.find((x) => x.name.startsWith('後'))?.color).toBeUndefined();
  });
});

describe('新限定の特殊ガチャを定例ガチャ名で表記する', () => {
  const regular = ['グリーンファンタジー', '超・獣神祭'];
  const lines = ['ガチャ「Ultra LIVE!!」は、「グリーンファンタジー」の限定キャラクターを含む木属性キャラクターが排出対象！'];
  it('別名は、新限定の記事のガチャが定例名に結び付くときだけ', () => {
    expect(gachaAlias('ガチャ「Ultra LIVE!!」開催！新限定「X」登場！', { start: 's', end: 'e', gacha: 'Ultra LIVE!!' }, lines, regular)).toEqual({ from: 'Ultra LIVE!!', to: 'グリーンファンタジー' });
    expect(gachaAlias('「新春 超・獣神祭」開催！新限定キャラ「X」', { start: 's', end: 'e', gacha: '新春!おまけ付き 超・獣神祭' }, [], regular)).toEqual({ from: '新春!おまけ付き 超・獣神祭', to: '超・獣神祭' });
    expect(gachaAlias('ガチャ「Ultra LIVE!!」開催！', { start: 's', end: 'e', gacha: 'Ultra LIVE!!' }, lines, regular)).toBeNull(); // 新限定の記事でない
    expect(gachaAlias('新限定「X」', { start: 's', end: 'e', gacha: 'Other' }, lines, regular)).toBeNull(); // 定例名が分からない
    expect(gachaAlias('新限定「X」', { start: 's', end: 'e', gacha: '超・獣神祭' }, [], regular)).toBeNull(); // すでに定例名
    expect(gachaAlias('新限定「X」', null, lines, regular)).toBeNull();
  });
  it('項目名のガチャ名だけを置き換える', () => {
    const a = { from: 'Ultra LIVE!!', to: 'グリーンファンタジー' };
    expect(applyGachaAlias('ガチャ「Ultra LIVE!!」開催!', a)).toBe('ガチャ「グリーンファンタジー」開催!');
    expect(applyGachaAlias('サイン色紙プレゼントキャンペーン開催!', a)).toBe('サイン色紙プレゼントキャンペーン開催!');
    expect(applyGachaAlias('ガチャ「Ultra LIVE!!」開催!', undefined)).toBe('ガチャ「Ultra LIVE!!」開催!');
  });
  it('書き出しで項目名が置き換わり、定例ガチャに入る。候補キー(item)は元の名前のまま', () => {
    const rec = record({ id: '20260709_1', title: 'ガチャ「Ultra LIVE!!」7/11より開催！新限定「X」登場！', category: 'event', parse_status: 'ok', gacha_alias: { from: 'Ultra LIVE!!', to: '超・獣神祭' },
      events: [{ id: '20260709_1#0', name: 'ガチャ「Ultra LIVE!!」開催!', label: '開催期間', start: '2026-07-11T00:00:00+09:00', end: '2026-07-12T23:59:00+09:00', raw: '' }] });
    const e = buildExport([rec], 'x').months[0]!.events[0]!;
    expect(e.name).toBe('ガチャ「超・獣神祭」開催!');
    expect(e.item).toContain('Ultra LIVE!!');
    expect(gachaGroup(e)).toBe('定例ガチャ');
  });
});

describe('定例ガチャの派生(モンコレDX・モンストジェネレーション)', () => {
  it('定例ガチャの語で始まる派生は定例ガチャ。語を含むだけの別のガチャは対象外', () => {
    for (const name of ['ガチャ「モンコレDX 〜アルセーヌ編〜」7/13 0時より開催！ #1', 'ガチャ「モンストジェネレーション2019 〜ソロモン編〜」', 'ガチャ「モンストジェネレーション 2019」5/19より開催！', 'ガチャ「モンコレDX Vol.1」']) {
      expect(regularGachaIndex(name)).toBeGreaterThanOrEqual(0);
      expect(gachaGroup({ category: 'event', name })).toBe('定例ガチャ');
    }
    expect(regularGachaIndex('ガチャ「選抜!13周年人気投票ガチャ」')).toBe(-1);
    expect(gachaGroup({ category: 'event', name: 'ガチャ「選抜!13周年人気投票ガチャ」' })).toBe('期間限定ガチャ');
  });
});

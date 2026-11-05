import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eventUrl, normalizeText, parseArticle, raidName } from '../src/period';

const fixture = (id: string): string[] =>
  readFileSync(new URL(`./fixtures/${id}.txt`, import.meta.url), 'utf8').split('\n');

const parse = (lines: string[], published = '2026-10-15') =>
  parseArticle({ id: 'T_1', title: 'テスト記事', published, lines });

describe('normalizeText', () => {
  it('全角数字・コロン・区切りを統一し、時分表記を直す', () => {
    expect(normalizeText('２０２６年１０月１６日（金）１２：００～１１月２日（月）１１：５９')).toBe(
      '2026年10月16日(金)12:00〜11月2日(月)11:59',
    );
    expect(normalizeText('12時00分－3時')).toBe('12:00〜3:00');
    expect(normalizeText('2時間')).toBe('2時間');
  });
});

describe('パターン(spec §4.2)', () => {
  const one = (line: string, published = '2026-10-15') => parse(['▼開催期間', line], published);

  it('完全形 / 空白あり', () => {
    for (const l of ['2026年10月27日（火）12:00～11月21日（土）11:59', '2026年10月27日（火） 12:00 ～ 11月21日（土） 11:59']) {
      const r = one(l);
      expect(r.parse_status).toBe('ok');
      expect(r.events[0]).toMatchObject({ start: '2026-10-27T12:00:00+09:00', end: '2026-11-21T11:59:00+09:00' });
      expect(r.warnings).toEqual([]);
    }
  });
  it('年・曜日なしは公開年で補完', () => {
    expect(one('10/16 12:00〜11/2 11:59').events[0]).toMatchObject({
      start: '2026-10-16T12:00:00+09:00',
      end: '2026-11-02T11:59:00+09:00',
    });
  });
  it('終了側の年省略: 開始年を継承し、開始より前なら翌年', () => {
    expect(one('2026年12月28日（月）12:00〜1月3日（日）11:59').events[0]?.end).toBe('2027-01-03T11:59:00+09:00');
    expect(one('2026年10月16日（金）12:00〜11月21日（土）11:59').events[0]?.end).toBe('2026-11-21T11:59:00+09:00');
  });
  it('年またぎ: 12月公開で1/5開始は翌年', () => {
    expect(one('1/5 12:00〜1/20 11:59', '2026-12-20').events[0]).toMatchObject({
      start: '2027-01-05T12:00:00+09:00',
      end: '2027-01-20T11:59:00+09:00',
    });
    expect(one('12/28 12:00〜1/3 11:59', '2026-12-20').events[0]).toMatchObject({
      start: '2026-12-28T12:00:00+09:00',
      end: '2027-01-03T11:59:00+09:00',
    });
  });
  it('公開日の180日前より前になる日付だけ翌年扱い', () => {
    expect(one('4/10 12:00〜4/20 11:59', '2026-10-15').events[0]?.start).toBe('2027-04-10T12:00:00+09:00');
    expect(one('4/25 12:00〜5/10 11:59', '2026-10-15').events[0]?.start).toBe('2026-04-25T12:00:00+09:00');
  });
  it('同日内で日付省略', () => {
    expect(one('10/16 12:00〜23:59').events[0]).toMatchObject({
      start: '2026-10-16T12:00:00+09:00',
      end: '2026-10-16T23:59:00+09:00',
    });
    expect(one('10/16 22:00〜3:59').events[0]?.end).toBe('2026-10-17T03:59:00+09:00');
  });
  it('開始のみは partial(end=null)', () => {
    const r = one('10/17 4:00〜');
    expect(r.parse_status).toBe('partial');
    expect(r.events[0]).toMatchObject({ start: '2026-10-17T04:00:00+09:00', end: null });
  });
  it('終了のみ(期限)は events に入れず、受取文脈なら reward_until', () => {
    const r = parse(['▼使用期限', '2026年11月4日（水）3:59まで']);
    expect(r.events).toEqual([]);
    expect(r.reward_until).toBeNull();
    expect(r.parse_status).toBe('none');
  });
  it('文中埋め込みの受取期限は reward_until', () => {
    const r = parse(['受け取り期限は2026年11月4日（水）11:59までです']);
    expect(r.reward_until).toBe('2026-11-04T11:59:00+09:00');
    expect(r.parse_status).toBe('partial');
  });
  it('頃・常時出現を除去', () => {
    expect(one('2026年10月23日（金）19:00頃〜11月2日（月）11:59の間で常時出現').events[0]).toMatchObject({
      start: '2026-10-23T19:00:00+09:00',
      end: '2026-11-02T11:59:00+09:00',
    });
  });
  it('24:00 は翌日00:00', () => {
    expect(one('10/16 12:00〜10/18 24:00').events[0]?.end).toBe('2026-10-19T00:00:00+09:00');
  });
  it('曜日誤記は日付を採用し警告', () => {
    const r = one('2026年10月27日（月）12:00〜12月1日（火）3:59');
    expect(r.events[0]?.start).toBe('2026-10-27T12:00:00+09:00');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('曜日不一致');
  });
  it('見出し行に日時が同居していても解析する', () => {
    const r = parse(['▼出現期間：2026年10月16日（金）12:00～11月2日（月）11:59', '▼受取期限 2026年11月4日（水）3:59まで']);
    expect(r.events[0]).toMatchObject({ label: '出現期間', end: '2026-11-02T11:59:00+09:00' });
    expect(r.reward_until).toBe('2026-11-04T03:59:00+09:00');
  });
  it('明示年で終了が開始より前なら警告', () => {
    expect(one('2026年10月20日(火)12:00〜2026年10月16日(金)11:59').warnings.join()).toContain('終了が開始より前');
  });
  it('期間なしは none', () => {
    expect(parse(['新イベント開催！']).parse_status).toBe('none');
  });
});

describe('名称・複数期間', () => {
  it('直前の見出し(# 行)を名称に使い、無ければ記事タイトル+連番', () => {
    const r = parse(['# 前半クエスト', '▼出現期間', '10/16 12:00〜10/20 11:59', '▼販売期間', '10/16 12:00〜10/20 11:59']);
    expect(r.events.map((e) => [e.id, e.name, e.label])).toEqual([
      ['T_1#0', '前半クエスト', '出現期間'],
      ['T_1#1', '前半クエスト', '販売期間'],
    ]);
    const r2 = parse(['▼出現期間', '10/16 12:00〜10/20 11:59']);
    expect(r2.events[0]?.name).toBe('テスト記事 #1');
  });
  it('期間でない▼見出しの下の日時は無視', () => {
    expect(parse(['▼配信日時', '2026年10月21日（水）19:00〜']).parse_status).toBe('none');
  });
});

describe('実記事フィクスチャ 20261015_2', () => {
  const r = parseArticle({ id: '20261015_2', title: 'コラボ', published: '2026-10-15', lines: fixture('20261015_2') });

  it('期間見出しごとに全体期間をeventにする(使用期限/利用期限/配信日時は対象外)', () => {
    expect(r.parse_status).toBe('ok');
    expect(r.events.map((e) => e.label)).toEqual([
      'ガチャ開催期間', '販売期間', '出現期間', '出現期間', '出現期間', '開催期間', '開催期間',
      'ログインスタンプ開催期間', '排出期間', '対象期間', '開催期間',
      '引用ポスト対象期間', '引用ポスト対象期間', '引用ポスト対象期間',
    ]);
  });
  it('全体期間と日別枠の混在: 全体に含まれる枠は slots に畳む', () => {
    expect(r.events[0]).toMatchObject({ start: '2026-10-16T12:00:00+09:00', end: '2026-11-02T11:59:00+09:00' });
    expect(r.events[0]?.slots).toHaveLength(3);
    expect(r.events[5]?.slots).toEqual([
      { start: '2026-10-17T04:00:00+09:00', end: null },
      { start: '2026-10-18T04:00:00+09:00', end: null },
    ]);
  });
  it('常時出現・翌月またぎ', () => {
    expect(r.events[4]).toMatchObject({ start: '2026-10-23T19:00:00+09:00', end: '2026-11-02T11:59:00+09:00' });
    expect(r.events[5]?.end).toBe('2026-11-05T03:59:00+09:00');
  });
  it('受け取り期限は reward_until', () => {
    expect(r.reward_until).toBe('2026-11-04T11:59:00+09:00');
  });
  it('終了のみの期限は警告のみ', () => {
    expect(r.warnings.filter((w) => w.startsWith('終了のみ'))).toHaveLength(2);
  });
});

describe('実記事フィクスチャ 20261022_3', () => {
  const r = parseArticle({ id: '20261022_3', title: '破界の星墓', published: '2026-10-22', lines: fixture('20261022_3') });
  it('期間3件・年なしの受取期限を補完', () => {
    expect(r.events).toHaveLength(3);
    expect(r.events[0]).toMatchObject({ start: '2026-10-27T12:00:00+09:00', end: '2026-11-21T11:59:00+09:00' });
    expect(r.reward_until).toBe('2026-11-24T03:59:00+09:00');
  });
  it('曜日誤記(10/27は火曜)は警告し採用', () => {
    expect(r.events[2]?.start).toBe('2026-10-27T12:00:00+09:00');
    expect(r.warnings.filter((w) => w.includes('曜日不一致'))).toHaveLength(1);
  });
});

describe('項目(見出し)単位と期間継承(spec §4.5)', () => {
  const lines = ['# 項目A!', '▼開催期間', '10/16 12:00〜11/2 11:59', '# 項目B!', '# 項目C', '# 配信を実施!', '▼配信日時', '10/20 19:00〜'];
  it('期間の無い告知見出しは events[0] の期間を inherited で追加。告知らしくない/別日時を持つ見出しは追加しない', () => {
    const r = parse(lines);
    expect(r.events.map((e) => [e.name, e.inherited ?? false])).toEqual([['項目A!', false], ['項目B!', true]]);
    expect(r.events[1]).toMatchObject({ id: 'T_1#1', start: r.events[0]?.start, end: r.events[0]?.end });
  });
  it('見出しのアンカーを項目(継承項目も)に付け、eventUrl が #anchor 付きURLにする', () => {
    const r = parseArticle({ id: 'T_1', title: 'テスト記事', published: '2026-10-15', lines, anchors: { '項目A!': '2', '項目B!': '3' } });
    expect(r.events.map((e) => e.anchor)).toEqual(['2', '3']);
    expect(eventUrl('https://x/1', r.events[0] ?? {})).toBe('https://x/1#2');
    expect(eventUrl('https://x/1', {})).toBe('https://x/1');
  });
  it('見出し前の期間は title_named', () => {
    expect(parse(['▼開催期間', '10/16 12:00〜11/2 11:59']).events[0]).toMatchObject({ name: 'テスト記事 #1', title_named: true });
  });
});

describe('メンテナンス', () => {
  const lines = ['導入', '▼メンテナンス実施日程', '2026年11月5日（木）0:00頃～5:00頃', '※前後する場合がございます。', '▼メンテナンス内容', '・サーバー機器メンテナンス', '注意書きの文章。'];
  it('「頃」付きの想定時間を期間にし、名称・内容(details)を付ける', () => {
    const r = parseArticle({ id: 'M_1', title: 'メンテナンスの実施について', published: '2026-10-30', lines });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ name: 'メンテナンス', start: '2026-11-05T00:00:00+09:00', end: '2026-11-05T05:00:00+09:00' });
    expect(r.events[0]?.details).toEqual([{ label: 'メンテナンス内容', lines: ['サーバー機器メンテナンス'] }]);
  });
  it('アップデートメンテナンスはVer.付きの名称', () => {
    const r = parseArticle({ id: 'M_2', title: '※重要※Ver.33.0アップデートメンテナンスの実施について', published: '2026-10-08', lines: lines.map((l) => l.replace('11月5日', '10月14日')) });
    expect(r.events[0]?.name).toBe('Ver.33.0アップデートメンテナンス');
  });
});

describe('降臨スケジュール', () => {
  const title = '新黎絶クエスト（キャローネ）が11/7より初登場！M4のライブ配信も！';
  const lines = ['導入文', '▼初出現日時', '2025年11月7日（金）19:00～11月8日（土）11:59', '# 降臨クリアボーナスキャンペーン開催!', '▼開催期間', '2025年11月7日（金）19:00～2026年1月2日（金）11:59'];
  const r = parseArticle({ id: 'R_1', title, published: '2025-10-30', lines });
  it('▼初出現日時を期間にし、名称は「黎絶 ボス名降臨」にする', () => {
    expect(r.events[0]).toMatchObject({ name: '黎絶 キャローネ降臨', label: '初出現日時', start: '2025-11-07T19:00:00+09:00', end: '2025-11-08T11:59:00+09:00', title_named: true });
    expect(raidName('新難易度【滅絶（めつぜつ）】クエスト（フィロソフィア）が11/3より初登場！')).toBe('滅絶 フィロソフィア降臨');
    expect(raidName('通常のイベント')).toBeNull();
    expect(raidName('黎絶（キャローネ）が初登場！')).toBe('黎絶 キャローネ降臨');
  });
  it('降臨記事でなければ ▼初出現日時 は期間にしない', () => {
    const x = parseArticle({ id: 'R_3', title: '新怪物「X」登場！', published: '2026-01-01', lines: ['▼初出現日時', '2026年1月5日（月）12:00～1月12日（月）11:59'] });
    expect(x.parse_status).toBe('none');
  });
  it('降臨は継承元にしない(期間なし告知は降臨ではなく本来の主期間を継承)', () => {
    const x = parseArticle({ id: 'R_2', title, published: '2025-10-30', lines: [...lines, '# 告知項目!'] });
    expect(x.events.find((e) => e.name === '告知項目!')).toMatchObject({ inherited: true, end: '2026-01-02T11:59:00+09:00' });
  });
});

describe('日付のみの終了と日別枠', () => {
  const lines = [
    '# 「英雄の神殿」で、チャンスバトルが必ず出現!',
    '▼開催期間',
    '2026年10月30日(金)〜11月4日(水)',
    '日付 時間帯',
    '10/30(金) 8:00〜9:00 12:00〜13:00 17:00〜18:00',
    '11/4(水) 11:00〜12:00 14:00〜15:00',
  ];
  const r = parseArticle({ id: 'S_1', title: 't', published: '2026-10-29', lines });
  it('日付のみの終了はその日の23:59まで。日別枠は全て slots に畳み、別eventにしない', () => {
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ start: '2026-10-30T00:00:00+09:00', end: '2026-11-04T23:59:00+09:00' });
    expect(r.events[0]?.slots?.map((s) => s.start.slice(5, 16))).toEqual(['10-30T08:00', '10-30T12:00', '10-30T17:00', '11-04T11:00', '11-04T14:00']);
  });
  it('<br>で改行された2回目以降の時間帯(日付なし行)も直前の日付の枠にする', () => {
    const x = parseArticle({ id: 'S_3', title: 't', published: '2026-10-29', lines: ['# 名称', '▼開催期間', '2026年10月30日(金)〜11月4日(水)', '日付 時間帯', '10/30(金) 8:00〜9:00', '12:00〜13:00', '17:00〜18:00', '11/4(水) 11:00〜12:00', '14:00〜15:00', '18:00〜19:00'] });
    expect(x.events).toHaveLength(1); // 最終日の夕方の枠(終了23:59より前)も別eventにならない
    expect(x.events[0]?.slots?.map((s) => s.start.slice(5, 16))).toEqual(['10-30T08:00', '10-30T12:00', '10-30T17:00', '11-04T11:00', '11-04T14:00', '11-04T18:00']);
  });
  it('1行に日付が複数ある行は、次の日付以降の時間帯を最初の日付に付けない', () => {
    const x = parseArticle({ id: 'S_2', title: 't', published: '2026-10-29', lines: ['# 名称', '▼開催期間', '10/30(金) 8:00〜9:00 11/4(水) 12:00〜13:00'] });
    expect(x.events.flatMap((e) => [e, ...(e.slots ?? [])]).some((e) => e.start.startsWith('2026-10-30T12:00'))).toBe(false);
  });
});

// 合成データのみ(実本文は含めない)
describe('▼の無い期間ラベル(フォールバック)', () => {
  const T = 'テストガチャ「サンプル」10/21より開催！';
  const p = (lines: string[], published = '2026-10-20') => parseArticle({ id: 'B_1', title: T, published, lines });

  it('表ヘッダ「開催期間 対象の年代」: 行の期間 × 年代ごとにイベントを作る(名前は ガチャ「名 年代」)', () => {
    const r = p(['導入文', '開催期間  対象の年代', '10/21 12:00～10/22 11:59  2013＆2014、2015、2016', '10/22 12:00～10/23 11:59  2017', '◎詳細はこちら', '# 見出し', '▼排出対象']);
    expect(r.parse_status).toBe('ok');
    expect(r.events.map((e) => [e.name, e.start, e.end])).toEqual([
      ['ガチャ「サンプル 2013＆2014」', '2026-10-21T12:00:00+09:00', '2026-10-22T11:59:00+09:00'],
      ['ガチャ「サンプル 2015」', '2026-10-21T12:00:00+09:00', '2026-10-22T11:59:00+09:00'],
      ['ガチャ「サンプル 2016」', '2026-10-21T12:00:00+09:00', '2026-10-22T11:59:00+09:00'],
      ['ガチャ「サンプル 2017」', '2026-10-22T12:00:00+09:00', '2026-10-23T11:59:00+09:00'],
    ]);
    expect(r.events[0]).toMatchObject({ label: '開催期間' });
    expect(r.events[0]?.title_named).toBeUndefined();
  });

  it('年代の表: 行の期間が重なっても日別枠に畳まず、年代ごとに別イベント。同じ年代名の見出しのアンカーを付ける', () => {
    const r = parseArticle({
      id: 'B_2', title: T, published: '2026-10-20',
      lines: ['開催期間  対象の年代', '10/21 12:00～10/23 11:59  2016', '10/21 12:00～10/22 11:59  2013＆2014、2015'],
      anchors: { 'ガチャ「サンプル 2015」': 'a2015' },
    });
    expect(r.events.map((e) => e.name)).toEqual(['ガチャ「サンプル 2016」', 'ガチャ「サンプル 2013＆2014」', 'ガチャ「サンプル 2015」']);
    expect(r.events.every((e) => e.slots === undefined)).toBe(true);
    expect(r.events[2]?.anchor).toBe('a2015');
    expect(r.events[0]?.anchor).toBeUndefined();
  });

  it('年代: 区切り(、・空白)と注記を許し、解釈できない語は警告に出す', () => {
    const r = p(['開催期間  対象の年代', '10/21 12:00～10/22 11:59  2015・2016 2017、2018（再） ※注 2019', '10/22 12:00～10/23 11:59  2013＆2014、旧作']);
    expect(r.events.map((e) => e.name.replace(/^ガチャ「サンプル |」$/g, ''))).toEqual(['2015', '2016', '2017', '2018', '2013＆2014']);
    expect(r.warnings.some((w) => w.includes('年代を解釈できない') && w.includes('旧作'))).toBe(true);
  });

  it('年代の表でも、ガチャ名の無いタイトルは年代別にしない(名前が年代だけになるため)', () => {
    const r = parseArticle({ id: 'B_3', title: 'テスト告知が10/21より開催', published: '2026-10-20', lines: ['開催期間  対象の年代', '10/21 12:00～10/22 11:59  2015、2016'] });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ name: 'テスト告知が10/21より開催 #1', title_named: true });
  });

  it('年代の見出しアンカー: 全角＆の年代も正規化した見出し名で引く', () => {
    const r = parseArticle({
      id: 'B_4', title: T, published: '2026-10-20',
      lines: ['開催期間  対象の年代', '10/21 12:00～10/22 11:59  2013＆2014'],
      anchors: { [normalizeText('ガチャ「サンプル 2013＆2014」')]: 'a1314' },
    });
    expect(r.events[0]).toMatchObject({ name: 'ガチャ「サンプル 2013＆2014」', anchor: 'a1314' });
  });

  it('年代の列が無い表は従来どおり(タイトルが名前)', () => {
    const r = p(['開催期間  備考', '10/21 12:00～10/22 11:59  2015']);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ name: `${T} #1`, title_named: true });
  });

  it('見出し「キャンペーン開催期間」直後の期間を取り、直前の見出しを項目名にしない', () => {
    const r = p(['# 特典', '・特典1', '# キャンペーン開催期間', '2026年10月3日（土）4:00～10月11日（日）3:59', '期間中は…', '（追記：10/19）', '※注意 10/25 12:00〜10/26 12:00']);
    expect(r.parse_status).toBe('ok');
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ name: `${T} #1`, title_named: true, label: 'キャンペーン開催期間', end: '2026-10-11T03:59:00+09:00' });
  });

  it('期間を取った後、期間でない行で閉じる(以降の日付は取らない)', () => {
    const r = p(['開催期間', '10/21 12:00〜10/22 11:59', '本文', '10/30 12:00〜10/31 11:59']);
    expect(r.events).toHaveLength(1);
  });

  it('受取期間などの受取系ラベルは対象外', () => {
    expect(p(['報酬受取期間', '10/21 12:00〜10/22 11:59']).parse_status).toBe('none');
  });

  it('従来の▼見出しで取れる記事の結果は変えない(フォールバックは none のときだけ)', () => {
    const lines = ['▼開催期間', '2026年10月27日（火）12:00～11月21日（土）11:59', '開催期間', '10/30 12:00〜10/31 11:59'];
    const r = p(lines, '2026-10-26');
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.start).toBe('2026-10-27T12:00:00+09:00');
  });

  it('ラベルは別の見出しに持ち越さない', () => {
    expect(p(['開催期間', '10/21 12:00〜10/22 11:59', '# 別見出し', '10/30 12:00〜10/31 11:59']).events).toHaveLength(1);
  });

  it('期間の無いラベルは、離れた日付を拾わない', () => {
    expect(p(['対象期間', '説明文', '※ 10/25 12:00〜10/26 12:00']).parse_status).toBe('none');
    expect(p(['期間', '説明文', '10/25 12:00〜10/26 12:00']).parse_status).toBe('none');
  });

  it('終了のみの行はラベルを閉じ、イベントにしない', () => {
    expect(p(['開催期間', '10/22 12:00まで', '10/25 12:00〜10/26 12:00']).parse_status).toBe('none');
  });

  it('期間ラベルがあっても期間が無ければ none のまま', () => {
    expect(p(['開催期間', '随時開催']).parse_status).toBe('none');
  });
});

import { describe, expect, it } from 'vitest';
import { extractBlocks, isNormalQuestExp, normalQuestBlock, tableOf } from '../src/details';
import { parseArticle } from '../src/period';

describe('extractBlocks', () => {
  it('▼…対象ステージ の ・項目を抽出する(見出し前)', () => {
    const lines = ['導入文', '▼出現期間', '2026年10月21日（水）12:00～11月8日（日）11:59', '# 「禁忌の獄〜深淵〜」出現', '▼本開催の「禁忌の獄～深淵〜」対象ステージ', '・火獄の無量大数', '・水獄の阿頼耶', '◎詳細はこちら'];
    expect(extractBlocks(lines)).toEqual([{ label: '本開催の「禁忌の獄～深淵〜」対象ステージ', heading: '「禁忌の獄〜深淵〜」出現', lines: ['火獄の無量大数', '水獄の阿頼耶'] }]);
  });
  it('古い記事の日付 `12月9日（火）  闇属性クエスト` を `12/9(火) 闇属性クエスト` にして抽出する(表の見出し行「日付 属性」は飛ばす)', () => {
    const lines = ['# 「追憶の書庫」でスコア報酬に「5倍」', '▼対象クエスト', '日付  属性', '12月9日（火）  闇属性クエスト', '12月10日（水）  木属性クエスト', '1月1日（木）  光明の神殿 特Lの園', '注意書きの文章です。'];
    expect(extractBlocks(lines)).toEqual([{ label: '対象クエスト', heading: '「追憶の書庫」でスコア報酬に「5倍」', lines: ['12/9(火) 闇属性クエスト', '12/10(水) 木属性クエスト', '1/1(木) 光明の神殿 特Lの園'] }]);
  });
  it('見出しの後ろの注記 `▼対象クエスト（追記：4/24）` も対象。ラベルに注記は含めない', () => {
    const lines = ['# 見出し', '▼対象クエスト（追記：4/24）', '4月24日（金）  火属性クエスト', '4月25日（土）  水属性クエスト'];
    expect(extractBlocks(lines)).toEqual([{ label: '対象クエスト', heading: '見出し', lines: ['4/24(金) 火属性クエスト', '4/25(土) 水属性クエスト'] }]);
  });
  it('N階層：クエスト の行を抽出し、◎の行で終わる', () => {
    const lines = ['▼本開催の1階層～5階層までのクエスト', '1階層：パライソの星墓', '2階層：黄泉の星墓', '◎詳細はこちら', '3階層：無関係'];
    const [b] = extractBlocks(lines);
    expect(b?.heading).toBeNull();
    expect(b?.lines).toEqual(['1階層：パライソの星墓', '2階層：黄泉の星墓']);
  });
  it('日付表: ヘッダを飛ばし、属性が次の行に分かれた行も1項目にする。注記で終わる', () => {
    const lines = ['# 「追憶の書庫」のクエスト', '▼対象クエスト', '日付  属性', '10/16（金）  光属性クエスト', '10/19（月）', '闇属性クエスト', '10/20（火）  水属性クエスト', '「Xの覚醒」は対象外です。'];
    expect(extractBlocks(lines)[0]?.lines).toEqual(['10/16(金) 光属性クエスト', '10/19(月) 闇属性クエスト', '10/20(火) 水属性クエスト']);
  });
  it('注意書き(文章)は項目にせず終端。日付だけの行に無関係な行を結合しない', () => {
    const lines = ['▼対象ステージ', '・A', '・上記以外のステージは対象外です。', '・B'];
    expect(extractBlocks(lines)[0]?.lines).toEqual(['A']);
    expect(extractBlocks(['▼対象クエスト', '10/19（月）', '「Xの覚醒」は対象外です。'])[0]?.lines).toEqual(['10/19(月)']);
  });
  it('項目が無ければブロックにしない', () => {
    expect(extractBlocks(['▼対象クエスト', '対象のクエストはクエスト選択画面でご確認ください。'])).toEqual([]);
  });
});

describe('parseArticle の details 付与', () => {
  const base = { id: 'x', title: 't', published: '2026-10-19' };
  it('見出しが項目名と一致すればその項目に付く', () => {
    const r = parseArticle({
      ...base,
      lines: ['# 「追憶の書庫」のクエストで金卵の排出率が「2倍」！', '▼対象期間', '2026年10月21日（水）0:00～10月25日（日）23:59', '▼対象クエスト', '日付  属性', '10/21（水）  闇属性クエスト'],
    });
    expect(r.events[0]?.details).toEqual([{ label: '対象クエスト', lines: ['10/21(水) 闇属性クエスト'] }]);
  });
  it('期間の無い見出しのステージ表は主期間(events[0])に付く。対象クエストだけの表は付かない', () => {
    const r = parseArticle({
      ...base,
      lines: ['▼出現期間', '2026年10月21日（水）12:00～11月8日（日）11:59', '# 別の見出し', '▼対象ステージ', '・A', '▼対象クエスト', '・B'],
    });
    expect(r.events[0]?.details).toEqual([{ label: '対象ステージ', lines: ['A'] }]);
  });
});

describe('normalQuestBlock', () => {
  const nq = (start: string, end: string | null, name = '「ノーマルクエスト」をクリアした際に獲得できる経験値が「2倍」!') => normalQuestBlock({ name, start, end });
  it('期間の日付ごとに曜日と対象属性を展開する(土=火水木 / 日=光闇 / 月=闇 / 火=火 / 水=水 / 木=木 / 金=光)', () => {
    expect(nq('2026-10-17T00:00:00+09:00', '2026-10-25T23:59:00+09:00')?.lines).toEqual([
      '10/17(土) 火・水・木属性クエスト',
      '10/18(日) 光・闇属性クエスト',
      '10/19(月) 闇属性クエスト',
      '10/20(火) 火属性クエスト',
      '10/21(水) 水属性クエスト',
      '10/22(木) 木属性クエスト',
      '10/23(金) 光属性クエスト',
      '10/24(土) 火・水・木属性クエスト',
      '10/25(日) 光・闇属性クエスト',
    ]);
  });
  it('終了が翌日0:00ちょうどなら翌日は含めない。終了未定は開始日のみ', () => {
    expect(nq('2026-10-19T00:00:00+09:00', '2026-10-20T00:00:00+09:00')?.lines).toEqual(['10/19(月) 闇属性クエスト']);
    expect(nq('2026-10-19T04:00:00+09:00', null)?.lines).toHaveLength(1);
  });
  it('年をまたぐ期間でも日付が連続する', () => {
    expect(nq('2026-12-31T00:00:00+09:00', '2027-01-01T23:59:00+09:00')?.lines).toEqual(['12/31(木) 木属性クエスト', '01/01(金) 光属性クエスト']);
  });
  it('ノーマルクエストの経験値アップ以外は対象外', () => {
    expect(nq('2026-10-19T00:00:00+09:00', null, '「追憶の書庫」で金卵2倍!')).toBeNull();
    expect(isNormalQuestExp('「ノーマルクエスト」の経験値が2倍')).toBe(true);
    expect(isNormalQuestExp('ノーマルクエストが追加')).toBe(false);
  });
});

describe('buildExport が details を通す', () => {
  it('event.details を ExportEvent に引き継ぐ', async () => {
    const { buildExport } = await import('../src/data/export');
    const details = [{ label: '対象クエスト', lines: ['10/21(水) 闇属性クエスト'] }];
    const rec = { id: 'x', url: 'u', title: 't', category: 'event', categories: ['event'], published: '2026-10-21', fetched_at: '', lastmod: null, content_hash: '', parse_status: 'ok' as const, reward_until: null, events: [{ id: 'x#0', name: 'n', label: 'l', start: '2026-10-21T00:00:00+09:00', end: '2026-10-22T00:00:00+09:00', raw: '', details }] };
    expect(buildExport([rec], '2026-10-21T00:00:00+09:00').months[0]?.events[0]?.details).toEqual(details);
  });
});

describe('buildExport: ピックアップの候補キー', () => {
  it('ピックアップの回は通常ガチャの行と同じ item(表示/非表示の判断が揃い、候補が増えない)', async () => {
    const { buildExport } = await import('../src/data/export');
    const base = { label: 'l', raw: '', start: '2026-10-21T00:00:00+09:00', end: '2026-10-22T00:00:00+09:00' };
    const rec = {
      id: 'x', url: 'u', title: '【作品×モンスト】コラボ', category: 'collab', categories: ['collab'], published: '2026-10-21', fetched_at: '', lastmod: null, content_hash: '', parse_status: 'ok' as const, reward_until: null,
      events: [
        { ...base, id: 'x#0', name: 'ガチャ「作品」詳細' },
        { ...base, id: 'x#1', name: 'ガチャ「作品｜ユル」', pickup: { name: 'ユル', order: 0, mainId: 'x#0' } },
      ],
    };
    const evs = buildExport([rec], '2026-10-21T00:00:00+09:00').months[0]?.events ?? [];
    expect(evs.map((e) => e.item)).toEqual(['ガチャ「作品」詳細', 'ガチャ「作品」詳細']);
    expect(evs[1]?.pickup).toEqual({ name: 'ユル', order: 0, mainId: 'x#0' });
  });
});

describe('tableOf', () => {
  it('日付行→日付/曜日/属性、階層行→階層/クエスト、箇条書きは表にしない', () => {
    expect(tableOf(['10/21(水) 闇属性クエスト'])).toEqual({ head: ['日付', '曜日', '対象属性'], rows: [['10/21', '水', '闇属性']] });
    expect(tableOf(['1階層：パライソの星墓'])?.rows).toEqual([['1階層', 'パライソの星墓']]);
    expect(tableOf(['火獄の無量大数'])).toBeNull();
    expect(tableOf(['10/21(水) 闇属性クエスト', '火獄'])).toBeNull();
  });
});

// 合成データのみ(実本文は含めない)
describe('ガチャ開催スケジュール(コラボ)', () => {
  const lines = [
    '# ガチャ「サンプル」開催!',
    '▼ガチャ開催期間',
    '2026年10月16日（金）12:00～11月2日（月）11:59',
    'ガチャ開催スケジュール',
    'コラボキャラクター5体が排出対象  10/16 12:00〜11/2 11:59',
    'Aピックアップ  10/18 12:00〜10/19 11:59',
    '10/21 12:00〜10/22 11:59',
    '10/30 12:00〜11/2 11:59（※）',
    'B＆Cピックアップ',
    '10/19 12:00～10/20 11:59',
    '※注意書きの行',
    '10/25 12:00〜10/26 11:59',
  ];

  it('表の行を `対象 | 期間` で抽出する(対象名のみの行・続きの行・全角の対象名を保つ)。表でない行で終わる', () => {
    const b = extractBlocks(lines).find((x) => x.label === 'ガチャ開催スケジュール');
    expect(b?.heading).toBe('ガチャ「サンプル」開催!');
    expect(b?.lines).toEqual([
      '通常ガチャ | 10/16 12:00〜11/2 11:59',
      'Aピックアップ | 10/18 12:00〜10/19 11:59',
      'Aピックアップ | 10/21 12:00〜10/22 11:59',
      'Aピックアップ | 10/30 12:00〜11/2 11:59',
      'B＆Cピックアップ | 10/19 12:00〜10/20 11:59',
    ]);
  });

  it('既定の行「コラボキャラクターN体が排出対象」は「通常ガチャ」と表示する(対象名のみの行でも)。期間の（※）は出さない', () => {
    const b = extractBlocks(['ガチャ開催スケジュール', 'コラボキャラクター10体が排出対象', '9/27 0:00〜10/16 11:59（※）', 'Xピックアップ  9/29 12:00〜9/30 11:59'])[0];
    expect(b?.lines).toEqual(['通常ガチャ | 9/27 0:00〜10/16 11:59', 'Xピックアップ | 9/29 12:00〜9/30 11:59']);
  });

  it('「ガチャスケジュール」の見出し(h2/h3)でも抽出する。行が無ければブロックを作らない', () => {
    expect(extractBlocks(['# ガチャスケジュール', 'Xピックアップ  10/1 0:00〜10/2 0:00'])[0]?.lines).toEqual(['Xピックアップ | 10/1 0:00〜10/2 0:00']);
    expect(extractBlocks(['ガチャ開催スケジュール', '本文のみ'])).toEqual([]);
  });

  it('表にする: 対象が前の行と同じなら空欄、日付・時刻は0埋め', () => {
    const t = tableOf(['Aピックアップ | 9/29 12:00〜9/30 11:59', 'Aピックアップ | 10/2 12:00〜10/3 11:59', 'Bピックアップ | 2026/1/1 0:00〜1/2 11:59（※）']);
    expect(t).toEqual({ head: ['対象', '期間'], rows: [['Aピックアップ', '09/29 12:00〜09/30 11:59'], ['', '10/02 12:00〜10/03 11:59'], ['Bピックアップ', '2026/01/01 00:00〜01/02 11:59（※）']] });
  });

  it('parseArticle: スケジュールの期間を日別枠に畳まず、ガチャ項目の details に付ける。本体の期間は不変', () => {
    const r = parseArticle({ id: 'S_1', title: '【テスト×モンスト】コラボ', published: '2026-10-15', lines });
    const g = r.events.find((e) => e.name === 'ガチャ「サンプル」開催!');
    expect(g).toMatchObject({ start: '2026-10-16T12:00:00+09:00', end: '2026-11-02T11:59:00+09:00' });
    expect(g?.slots).toBeUndefined();
    expect(g?.details?.map((d) => d.label)).toEqual(['ガチャ開催スケジュール']);
    expect(r.events.filter((e) => !e.pickup)).toHaveLength(1); // ピックアップの回は別イベント(下のテスト)
  });

  it('見出しが項目名と一致しなくても、ガチャ「」の項目に付ける', () => {
    const r = parseArticle({ id: 'S_2', title: 'テスト', published: '2026-10-15', lines: ['# ガチャ「サンプル」開催!', '▼ガチャ開催期間', '2026年10月16日（金）12:00～11月2日（月）11:59', '# 別の見出し', 'ガチャ開催スケジュール', 'Aピックアップ  10/18 12:00〜10/19 11:59'] });
    expect(r.events[0]?.details?.[0]?.lines).toEqual(['Aピックアップ | 10/18 12:00〜10/19 11:59']);
  });
});

describe('ガチャ開催スケジュールの境界', () => {
  it('スケジュール見出しが h2/h3 のとき、次の▼の項目名を前の見出しにしない', () => {
    const r = parseArticle({ id: 'S_3', title: 'ガチャ「サンプル」10/1より開催！', published: '2026-10-01', lines: ['# 前の見出し', '# ガチャスケジュール', 'Aピックアップ  10/2 12:00〜10/3 11:59', '▼開催期間', '2026年10月1日（木）12:00～10月5日（月）11:59'] });
    expect(r.events.filter((e) => !e.pickup)).toHaveLength(1);
    expect(r.events[0]?.name).not.toBe('前の見出し');
    expect(r.events[0]?.title_named).toBe(true);
  });
  it('スケジュールの後の▼期間は通常どおりイベントになる。半角(※)も行として扱う', () => {
    const r = parseArticle({ id: 'S_4', title: 'テスト', published: '2026-10-01', lines: ['ガチャ開催スケジュール', 'Aピックアップ  10/2 12:00〜10/3 11:59(※)', '▼開催期間', '2026年10月1日（木）12:00～10月5日（月）11:59'] });
    expect(r.events).toHaveLength(1);
    expect(extractBlocks(['ガチャ開催スケジュール', 'Aピックアップ  10/2 12:00〜10/3 11:59(※)'])[0]?.lines).toEqual(['Aピックアップ | 10/2 12:00〜10/3 11:59']);
  });
  it('表は # ・▼ で終わり、対象名のみの行は文章・注記・期間ラベルを対象にしない', () => {
    const lines = ['ガチャ開催スケジュール', 'A  10/2 12:00〜10/3 11:59', '▼次', 'B  10/4 12:00〜10/5 11:59'];
    expect(extractBlocks(lines)[0]?.lines).toEqual(['A | 10/2 12:00〜10/3 11:59']);
    expect(extractBlocks(['ガチャ開催スケジュール', '開催期間', '10/2 12:00〜10/3 11:59'])).toEqual([]);
    expect(extractBlocks(['ガチャ開催スケジュール', '※注意', '10/2 12:00〜10/3 11:59'])).toEqual([]);
    expect(extractBlocks(['ガチャ開催スケジュール', 'これは長い文章です。', '10/2 12:00〜10/3 11:59'])).toEqual([]);
  });
  it('tableOf: 期間を含まない ` | ` の行は表にしない(箇条書きのまま)', () => {
    expect(tableOf(['a | b'])).toBeNull();
  });
});

describe('ガチャの日替わりピックアップ(Vol)と対象キャラ', () => {
  const T = 'ガチャ「サンプルDX」10/26より開催！';
  const vol = [
    '▼開催期間',
    '2026年10月26日（月）12:00～10月28日（水）11:59',
    '# ピックアップした4体のキャラの排出確率が超UPする期間',
    '・Vol.1',
    '期間：10/26 12:00～10/27 11:59',
    '対象キャラ：アルファ、ベータ、ガンマ、デルタ',
    '・Vol.2',
    '期間：10/27 12:00～10/28 11:59',
    '対象キャラ：イプシロン、ゼータ、エータ、シータ',
    '# 排出確率UP対象キャラクター',
    'キャラクター  レアリティ  属性',
  ];

  it('Vol ごとに1イベント(名前 ガチャ「名 Vol.N」)。全体期間を覆うなら全体期間の行は作らない。対象キャラを details に', () => {
    const r = parseArticle({ id: 'V_1', title: T, published: '2026-10-23', lines: vol });
    expect(r.parse_status).toBe('ok');
    expect(r.events.map((e) => [e.name, e.start, e.end])).toEqual([
      ['ガチャ「サンプルDX Vol.1」', '2026-10-26T12:00:00+09:00', '2026-10-27T11:59:00+09:00'],
      ['ガチャ「サンプルDX Vol.2」', '2026-10-27T12:00:00+09:00', '2026-10-28T11:59:00+09:00'],
    ]);
    expect(r.events[0]?.details).toEqual([{ label: '対象キャラ', lines: ['アルファ', 'ベータ', 'ガンマ', 'デルタ'] }]);
    expect(new Set(r.events.map((e) => e.id)).size).toBe(2);
  });

  it('Vol が全体期間を覆わないときは全体期間の行も残す。ガチャ名の無いタイトルは対象外', () => {
    const partial = vol.map((l) => l.replace('10月28日（水）11:59', '10月30日（金）11:59'));
    expect(parseArticle({ id: 'V_2', title: T, published: '2026-10-23', lines: partial }).events).toHaveLength(3);
    expect(parseArticle({ id: 'V_3', title: 'テスト告知', published: '2026-10-23', lines: vol }).events.some((e) => e.name.includes('Vol.'))).toBe(false);
  });

  it('Vol 以外の記事は不変(Vol の行が無ければ何もしない)', () => {
    const r = parseArticle({ id: 'V_4', title: T, published: '2026-10-23', lines: vol.slice(0, 2) });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.details).toBeUndefined();
  });

  it('▼排出対象の限定キャラクター の `、`区切りのキャラ名を、同名の見出しの項目(年代別の行)に付ける', () => {
    const lines = [
      '開催期間  対象の年代',
      '10/21 12:00～10/22 11:59  2013＆2014',
      '◎詳細はこちら',
      '# ガチャ「サンプル 2013＆2014」',
      '▼排出対象の限定キャラクター',
      'アルファ、ベータ、Two for all',
      '◎排出対象の★5キャラクターはこちら',
      '▼別の見出し',
    ];
    expect(extractBlocks(lines)).toEqual([{ label: '排出対象の限定キャラクター', heading: 'ガチャ「サンプル 2013＆2014」', lines: ['アルファ', 'ベータ', 'Two for all'] }]);
    const r = parseArticle({ id: 'V_5', title: 'ガチャ「サンプル」10/21より開催！', published: '2026-10-20', lines });
    expect(r.events[0]?.name).toBe('ガチャ「サンプル 2013＆2014」');
    expect(r.events[0]?.details?.[0]?.lines).toEqual(['アルファ', 'ベータ', 'Two for all']);
  });

  it('他の「対象キャラクター」見出し(排出対象キャラクター等)は拾わない', () => {
    expect(extractBlocks(['▼排出対象キャラクター', 'アルファ、ベータ'])).toEqual([]);
    expect(extractBlocks(['▼排出対象の限定キャラクター▼', 'アルファ、ベータ'])).toEqual([]);
  });
});

describe('Vol・対象キャラの境界', () => {
  const T = 'ガチャ「サンプルDX」10/26より開催！';
  const vols = ['・Vol.1', '期間：10/26 12:00～10/27 11:59', '対象キャラ：アルファ、ベータ', '・Vol.2', '期間：10/27 12:00～10/28 11:59', '対象キャラ：ガンマ、デルタ'];
  const whole = ['▼開催期間', '2026年10月26日（月）12:00～10月28日（水）11:59'];

  it('同じ期間の別項目(別名の▼期間)は残す。置き換えるのは全体期間の行だけ', () => {
    const r = parseArticle({ id: 'W_1', title: T, published: '2026-10-23', lines: ['# 別キャンペーン開催!', ...whole, '# ピックアップ期間', ...vols] });
    expect(r.events.map((e) => e.name)).toEqual(['別キャンペーン開催!', 'ガチャ「サンプルDX Vol.1」', 'ガチャ「サンプルDX Vol.2」']);
    expect(new Set(r.events.map((e) => e.id)).size).toBe(3);
  });

  it('全体期間の行を置き換えても、対象ステージ等のブロックは残った項目に付く', () => {
    const r = parseArticle({ id: 'W_2', title: T, published: '2026-10-23', lines: [...whole, '▼対象ステージ', '・ステージA', ...vols] });
    expect(r.events.every((e) => e.name.includes('Vol.'))).toBe(true);
    expect(r.events[0]?.details?.map((d) => d.label)).toEqual(['対象キャラ', '対象ステージ']);
  });

  it('期間の無いVol・対象キャラの無いVolの扱い', () => {
    const r = parseArticle({ id: 'W_3', title: T, published: '2026-10-23', lines: [...whole, '・Vol.1', '対象キャラ：アルファ', '・Vol.2', '期間：10/27 12:00～10/28 11:59'] });
    // 期間の無い Vol は作らない。残った Vol.2 は全体期間を覆わないので、全体期間の行も残る
    expect(r.events).toHaveLength(2);
    expect(r.events.find((e) => e.name.endsWith('Vol.2」'))?.details).toBeUndefined();
    expect(r.events.some((e) => e.name.endsWith('Vol.1」'))).toBe(false);
  });

  it('▼ガチャ「… Vol.1」のような見出しはVolの行として扱わない', () => {
    const r = parseArticle({ id: 'W_4', title: T, published: '2026-10-23', lines: [...whole, '▼ガチャ「サンプルDX Vol.1」', '＜★5-6:12.0%＞'] });
    expect(r.events).toHaveLength(1);
  });

  it('対象キャラ: 括弧内の、で区切らず、名前の後の表の見出し行は含めない', () => {
    expect(extractBlocks(['▼排出対象の限定キャラクター', 'アルファ（A、B）、ベータ', 'キャラクター  レアリティ  属性'])[0]?.lines).toEqual(['アルファ（A、B）', 'ベータ']);
  });
});

// 合成データのみ(実本文は含めない)
describe('ガチャの対象キャラクター表', () => {
  const T = 'ガチャ「サンプル星歌」3/4より開催！';
  const lines = [
    '▼開催期間',
    '2026年3月4日（水）12:00～3月6日（金）11:59',
    '▼対象キャラクター',
    'キャラクター  レアリティ  属性',
    'アルファ  ★6（獣神化前）  火',
    'ベータ  ★5  水',
    'ガンマ＆デルタ  ★6（獣神化前）',
    '光',
    'イプシロン  ★6（獣神化前）  闇',
    '※ガチャ「サンプル星歌」の排出されないキャラクターや詳細は、ガチャ画面よりご確認ください。',
  ];

  it('表の行を `名前 | レアリティ | 属性` にする(ヘッダは読み飛ばす。属性が次の行に分かれた行を合わせる)。※で終わる', () => {
    const b = extractBlocks(lines)[0];
    expect(b?.label).toBe('対象キャラクター');
    expect(b?.lines).toEqual(['アルファ | ★6（獣神化前） | 火', 'ベータ | ★5 | 水', 'ガンマ＆デルタ | ★6（獣神化前） | 光', 'イプシロン | ★6（獣神化前） | 闇']);
  });

  it('tableOf: キャラクター・レアリティ・属性の表にする', () => {
    expect(tableOf(['アルファ | ★6（獣神化前） | 火', 'ベータ | ★5 | 水'])).toEqual({ head: ['キャラクター', 'レアリティ', '属性'], rows: [['アルファ', '★6（獣神化前）', '火'], ['ベータ', '★5', '水']] });
  });

  it('parseArticle: ガチャ「」の項目に付く(期間・イベント数は不変)', () => {
    const r = parseArticle({ id: 'C_1', title: T, published: '2026-03-03', lines: ['# ガチャ「サンプル星歌」開催!', ...lines] });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.details?.map((d) => d.label)).toEqual(['対象キャラクター']);
    expect(r.events[0]?.details?.[0]?.lines).toHaveLength(4);
  });

  it('見出しが無くても(タイトル由来の項目でも)付く。表の無い▼対象キャラクターはブロックを作らない', () => {
    const r = parseArticle({ id: 'C_2', title: T, published: '2026-03-03', lines });
    expect(r.events[0]?.details?.[0]?.label).toBe('対象キャラクター');
    expect(extractBlocks(['▼対象キャラクター', '※注意'])).toEqual([]);
  });

  it('属性の無い行・属性だけの行が続いても壊れない(先頭の属性だけの行は無視されて表を終える)', () => {
    expect(extractBlocks(['▼対象キャラクター', '光', 'アルファ  ★5  火'])).toEqual([]);
  });
});

// 合成データのみ(実本文は含めない)
describe('コラボガチャのピックアップをイベントに展開', () => {
  const lines = [
    '# ガチャ「サンプル作品」開催!',
    '▼ガチャ開催期間',
    '2026年10月16日（金）12:00～11月2日（月）11:59',
    'ガチャ開催スケジュール',
    'コラボキャラクター5体が排出対象  10/16 12:00〜11/2 11:59',
    'アルファ＆ベータピックアップ  10/18 12:00〜10/19 11:59',
    '10/21 12:00〜10/22 11:59',
    'ガンマピックアップ  10/19 12:00〜10/20 11:59',
    '10/30 12:00〜11/2 11:59（※）',
  ];
  const r = parseArticle({ id: 'P_1', title: '【テスト×モンスト】コラボ', published: '2026-10-15', lines });
  const picks = r.events.filter((e) => e.pickup);

  it('ピックアップごと・回ごとにイベントを作る(名前 ガチャ「作品｜ピックアップ名」。通常ガチャは作らない)', () => {
    expect(picks.map((e) => [e.name, e.start, e.end])).toEqual([
      ['ガチャ「サンプル作品｜アルファ＆ベータ」', '2026-10-18T12:00:00+09:00', '2026-10-19T11:59:00+09:00'],
      ['ガチャ「サンプル作品｜アルファ＆ベータ」', '2026-10-21T12:00:00+09:00', '2026-10-22T11:59:00+09:00'],
      ['ガチャ「サンプル作品｜ガンマ」', '2026-10-19T12:00:00+09:00', '2026-10-20T11:59:00+09:00'],
      ['ガチャ「サンプル作品｜ガンマ」', '2026-10-30T12:00:00+09:00', '2026-11-02T11:59:00+09:00'],
    ]);
  });

  it('pickup に表示名・登場順・通常ガチャ(表を持つ項目)の id/開始を持つ。idは重複しない', () => {
    const main = r.events.find((e) => e.details?.length);
    expect(main?.name).toBe('ガチャ「サンプル作品」開催!');
    expect(picks.map((e) => e.pickup)).toEqual([
      { name: 'アルファ＆ベータ', order: 0, mainId: main?.id },
      { name: 'アルファ＆ベータ', order: 0, mainId: main?.id },
      { name: 'ガンマ', order: 1, mainId: main?.id },
      { name: 'ガンマ', order: 1, mainId: main?.id },
    ]);
    expect(new Set(r.events.map((e) => e.id)).size).toBe(r.events.length);
  });

  it('各回に、そのピックアップの全ての回の表(details)を付ける(他のピックアップの行は含めない)。色は表の対象名に', () => {
    const rr = parseArticle({ id: 'P_4', title: '【テスト×モンスト】コラボ', published: '2026-10-15', lines, colors: { ガンマ: '#007d32' } });
    const g = rr.events.filter((e) => e.pickup?.name === 'ガンマ');
    expect(g).toHaveLength(2);
    for (const e of g) {
      expect(e.details).toEqual([{ label: 'ピックアップスケジュール', lines: ['ガンマピックアップ | 10/19 12:00〜10/20 11:59', 'ガンマピックアップ | 10/30 12:00〜11/2 11:59'], colors: { ガンマピックアップ: '#007d32' } }]);
    }
    const a = rr.events.find((e) => e.pickup?.name === 'アルファ＆ベータ');
    expect(a?.details?.[0]?.lines).toHaveLength(2);
    expect(a?.details?.[0]?.colors).toBeUndefined(); // 色の無いピックアップ
  });

  it('スケジュールの表が無い記事、期間を読めない行、ガチャ名の無い項目では作らない', () => {
    expect(parseArticle({ id: 'P_2', title: 'テスト', published: '2026-10-15', lines: lines.slice(0, 3) }).events.some((e) => e.pickup)).toBe(false);
    const bad = parseArticle({ id: 'P_3', title: 'テスト', published: '2026-10-15', lines: [...lines.slice(0, 4), 'Xピックアップ', '未定'] });
    expect(bad.events.some((e) => e.pickup)).toBe(false);
  });
});

// 合成データのみ(実本文は含めない)
describe('ピックアップの色(公式の配色)', () => {
  it('spanColors: 表のセル内の色付き span のテキスト → #rrggbb。背景色・長い文・空・表外・rgba・border-color は拾わず、同じテキストは最初の色', async () => {
    const { spanColors } = await import('../src/scraper/detail');
    const { parse } = await import('node-html-parser');
    const body = parse(`<div>
      <p class="note"><span style="color: rgb(255, 54, 56);">ユル</span></p>
      <table><tr>
      <td><span style="color: rgb(162, 55, 195);">ユル</span>ピックアップ</td>
      <td><ruby><span style="color: rgb(0, 125, 50);">アサ</span>ピックアップ</ruby></td>
      <td><span style="background-color: rgb(1, 2, 3);">背景だけ</span></td>
      <td><span style="border-color: rgb(1, 2, 3);">枠だけ</span></td>
      <td><span style="color: rgba(1, 2, 3, 0.5);">半透明</span></td>
      <td><span style="color: rgb(255, 54, 56);">${'あ'.repeat(41)}</span></td>
      <td><span style="color: rgb(1, 1, 1);"> </span></td>
      <td><span style="color: rgb(9, 9, 9);">ユル</span></td>
      <td><span style="margin: 0; color: rgb(10, 20, 30);">前に別指定</span></td>
      <td><span>色なし</span></td>
      </tr></table></div>`);
    expect(spanColors(body as never)).toEqual({ ユル: '#a237c3', アサ: '#007d32', 前に別指定: '#0a141e' });
  });

  it('spanColors: __proto__ / constructor などのテキストも own プロパティとして安全に扱う', async () => {
    const { spanColors } = await import('../src/scraper/detail');
    const { parse } = await import('node-html-parser');
    const c = spanColors(parse('<table><tr><td><span style="color: rgb(1, 2, 3);">__proto__</span><span style="color: rgb(4, 5, 6);">constructor</span></td></tr></table>') as never);
    expect(Object.keys(c)).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
  });

  const lines = ['# ガチャ「作品」開催!', '▼ガチャ開催期間', '2026年10月16日（金）12:00～11月2日（月）11:59', 'ガチャ開催スケジュール', 'ユルピックアップ  10/18 12:00〜10/19 11:59', 'アサピックアップ  10/19 12:00〜10/20 11:59'];
  it('parseArticle: ピックアップのイベントと表の対象名に色が付く(色の無いピックアップは色なし)', () => {
    const r = parseArticle({ id: 'K_1', title: 'テスト', published: '2026-10-15', lines, colors: { ユル: '#a237c3', 無関係: '#000000' } });
    expect(r.events.filter((e) => e.pickup).map((e) => [e.pickup?.name, e.pickup?.color])).toEqual([['ユル', '#a237c3'], ['アサ', undefined]]);
    expect(r.events[0]?.details?.[0]?.colors).toEqual({ ユルピックアップ: '#a237c3' });
  });
  it('色: 継承プロパティ名(constructor)のピックアップに色は付かない。表の対象名全体を囲む span の色も使う', () => {
    const l2 = [...lines.slice(0, 4), 'constructorピックアップ  10/18 12:00〜10/19 11:59', 'ワルピックアップ  10/19 12:00〜10/20 11:59'];
    const r = parseArticle({ id: 'K_3', title: 'テスト', published: '2026-10-15', lines: l2, colors: { ワルピックアップ: '#007d32' } });
    expect(r.events.filter((e) => e.pickup).map((e) => [e.pickup?.name, e.pickup?.color])).toEqual([['constructor', undefined], ['ワル', '#007d32']]);
    expect(r.events[0]?.details?.[0]?.colors).toEqual({ ワルピックアップ: '#007d32' });
  });
  it('色が取れない記事は従来どおり(colors を持たない)', () => {
    const r = parseArticle({ id: 'K_2', title: 'テスト', published: '2026-10-15', lines });
    expect(r.events[0]?.details?.[0]?.colors).toBeUndefined();
    expect(r.events.filter((e) => e.pickup).every((e) => e.pickup?.color === undefined)).toBe(true);
  });
});

describe('クエスト名の属性色', () => {
  it('禁忌の獄: 名前の先頭の属性(火・水・木・光・闇)+獄 を赤・青・緑・黄・紫に。獄で始まらない名前は色なし', async () => {
    const { questNameColor } = await import('../src/quest-color');
    expect(['火獄の無量大数', '水獄の阿頼耶', '木獄の涅槃寂静', '光獄の某', '闇獄の某'].map(questNameColor)).toEqual(['#eb0043', '#3154ef', '#007d32', '#a16800', '#a237c3']);
    expect(questNameColor('無獄の某')).toBeUndefined();
    expect(questNameColor('地獄の門')).toBeUndefined();
  });

  it('破界の星墓: 対応表の15種(ユーザ指定)。&と＆は同じ。対応表に無ければ色なし', async () => {
    const { questNameColor } = await import('../src/quest-color');
    const exp: [string, string][] = [
      ['パライソの星墓', '#007d32'], ['黄泉の星墓', '#a237c3'], ['ティルナノーグの星墓', '#3154ef'], ['アアルの星墓', '#a16800'], ['アヴァロンの星墓', '#eb0043'],
      ['シャンバラの星墓', '#007d32'], ['アポカリプスの星墓', '#a237c3'], ['アラミタマの星墓', '#3154ef'], ['ラブの星墓', '#a16800'], ['パラノヴィアの星墓', '#eb0043'],
      ['ニギミタマの星墓', '#eb0043'], ['桃源郷の星墓', '#3154ef'], ['コキュートスの星墓', '#007d32'], ['ラルガメンテの星墓', '#a16800'], ['メラン＆コリン', '#a237c3'],
    ];
    expect(exp.map(([n]) => questNameColor(n))).toEqual(exp.map(([, c]) => c));
    expect(questNameColor('メラン&コリン')).toBe('#a237c3');
    expect(questNameColor('未知の星墓')).toBeUndefined();
  });

  it('色を付けるのは対象ステージ/階層クエストのブロックだけ', async () => {
    const { isQuestNameBlock } = await import('../src/quest-color');
    expect(isQuestNameBlock('本開催の「禁忌の獄〜深淵〜」対象ステージ')).toBe(true);
    expect(isQuestNameBlock('本開催の1階層～5階層までのクエスト')).toBe(true);
    expect(isQuestNameBlock('対象クエスト')).toBe(false);
    expect(isQuestNameBlock('メンテナンス内容')).toBe(false);
  });
});

describe('破界の星墓の6〜10階層(固定)', () => {
  it('表記ゆれ: 中黒入りの ティル・ナ・ノーグ も ティルナノーグ の色(青)', async () => {
    const { questNameColor } = await import('../src/quest-color');
    expect(questNameColor('ティル・ナ・ノーグの星墓')).toBe('#3154ef');
  });

  it('withFixedFloors: 破界の星墓の階層クエストに6〜10階層を固定で追加し、ラベルの上限を10階層に直す', async () => {
    const { withFixedFloors } = await import('../src/quest-color');
    const block = { label: '本開催の1階層～5階層までのクエスト', lines: ['1階層：パライソの星墓', '2階層：黄泉の星墓', '3階層：アアルの星墓', '4階層：ラブの星墓', '5階層：パラノヴィアの星墓'] };
    const r = withFixedFloors('「破界の星墓」が10/27より期間限定で登場！ #1', block);
    expect(r.label).toBe('本開催の1階層～10階層までのクエスト');
    expect(r.lines.slice(5)).toEqual(['6階層：ニギミタマの星墓', '7階層：桃源郷の星墓', '8階層：コキュートスの星墓', '9階層：ラルガメンテの星墓', '10階層：メラン&コリンの星墓']);
    expect(r.lines.slice(0, 5)).toEqual(block.lines);
    expect(block.lines).toHaveLength(5); // 元のブロックは変えない
    expect(tableOf(r.lines)?.rows).toHaveLength(10);
  });

  it('記事に同じ階層番号があれば追加しない。破界の星墓以外の項目・階層クエスト以外のブロックはそのまま', async () => {
    const { withFixedFloors } = await import('../src/quest-color');
    const own = { label: '本開催の1階層～7階層までのクエスト', lines: ['1階層：A', '6階層：独自の星墓', '7階層：B'] };
    const r = withFixedFloors('「破界の星墓」', own);
    expect(r.lines).toEqual(['1階層：A', '6階層：独自の星墓', '7階層：B', '8階層：コキュートスの星墓', '9階層：ラルガメンテの星墓', '10階層：メラン&コリンの星墓']);
    expect(r.label).toBe('本開催の1階層～10階層までのクエスト');
    const other = { label: '本開催の1階層～5階層までのクエスト', lines: ['1階層：A'] };
    expect(withFixedFloors('「別のクエスト」', other)).toBe(other);
    const stage = { label: '対象ステージ', lines: ['火獄の無量大数'] };
    expect(withFixedFloors('「破界の星墓」', stage)).toBe(stage);
  });
});

// 合成データのみ(実本文は含めない)
describe('超究極・絶級のボス名の公式色(行ラベル)', () => {
  it('attributeColors: 属性色(5色)の色付きテキストを、表の外も含め出現順に返す。他の色・背景色・長い文・空は除く', async () => {
    const { attributeColors } = await import('../src/scraper/detail');
    const { parse } = await import('node-html-parser');
    const body = parse(`<div>
      <p><span style="color: rgb(49, 84, 239);">ボスA ミザリー（★6）</span></p>
      <table><tr><td><span style="color: rgb(162, 55, 195);">表のキャラ</span></td></tr></table>
      <span style="color: rgb(255, 54, 56);">赤い注意書き(5色ではない)</span>
      <span style="color: rgb(137, 137, 137);">灰色</span>
      <span style="background-color: rgb(235, 0, 67);">背景色</span>
      <span style="color: rgb(235, 0, 67);">${'あ'.repeat(41)}</span>
      <span style="color: rgb(0, 125, 50);"> </span>
      <span style="color: rgb(161, 104, 0);">最後</span></div>`);
    expect(attributeColors(body as never)).toEqual([['ボスA ミザリー（★6）', '#3154ef'], ['表のキャラ', '#a237c3'], ['最後', '#a16800']]);
  });

  const spans: [string, string][] = [['無関係の文', '#eb0043'], ['惨劇の貴婦人 サンプル（★6）', '#3154ef'], ['惨劇の貴婦人 サンプル', '#a237c3'], ['別のボス ヴェイン', '#007d32']];
  const su = (title: string, name: string) => parseArticle({ id: 'B_1', title, published: '2026-10-20', lines: [`# ${name}`, '▼出現期間', '2026年10月30日（金）12:00～11月30日（月）11:59'], bossColors: spans });

  it('超究極: 項目名のキャラ名(超究極・兵クエスト（サンプル）→サンプル)を含む最初の色テキストの色', () => {
    const r = su('超究極・兵クエスト（サンプル）が10/30より出現！', '超究極・兵クエスト（サンプル）が出現!');
    expect(r.events[0]?.color).toBe('#3154ef'); // 最初に出現した ★6 の青(後の紫ではない)
  });

  it('絶級: 轟絶/黎絶/滅絶 の後のボス名を含む色テキスト。降臨の名前から接頭・接尾を除く', () => {
    const r = parseArticle({ id: 'B_2', title: '新轟絶クエスト（ヴェイン）が10/30より初登場！', published: '2026-10-20', lines: ['▼初出現日時', '2026年10月30日（金）19:00～10月31日（土）11:59'], bossColors: spans });
    expect(r.events[0]?.name).toBe('轟絶 ヴェイン降臨');
    expect(r.events[0]?.color).toBe('#007d32');
  });

  it('ボス名に一致する色が無い・bossColors が無い・ボスでない項目は color なし', () => {
    expect(su('超究極クエスト（未知）が出現！', '超究極クエスト（未知）が出現!').events[0]?.color).toBeUndefined();
    const none = parseArticle({ id: 'B_3', title: '超究極・兵クエスト（サンプル）が出現', published: '2026-10-20', lines: ['# 超究極・兵クエスト（サンプル）が出現!', '▼出現期間', '2026年10月30日（金）12:00～11月30日（月）11:59'] });
    expect(none.events[0]?.color).toBeUndefined();
    const other = parseArticle({ id: 'B_4', title: 'テスト', published: '2026-10-20', lines: ['# ふつうの項目', '▼開催期間', '2026年10月30日（金）12:00～11月30日（月）11:59'], bossColors: [['ふつうの項目', '#eb0043']] });
    expect(other.events[0]?.color).toBeUndefined();
  });

  it('超究極クエスト「クエスト名」: 題名の「」はクエスト名。本文の `クエスト名（★5 キャラ名）` からキャラ名(boss)と、その色を取る', () => {
    const lines = ['# 超究極クエスト「サンプルの儀式」が登場！', '▼出現期間', '2026年10月30日（金）12:00～11月30日（月）11:59', '▼対象クエスト', '・サンプルの儀式（★5 ボスサンプル）', '・別のクエスト（★5 別のキャラ）'];
    const r = parseArticle({ id: 'B_5', title: '超究極クエスト「サンプルの儀式」が登場！', published: '2026-10-20', lines, bossColors: [['火属性 ★5', '#eb0043'], ['ボスサンプル', '#eb0043'], ['別のキャラ', '#3154ef']] });
    const e = r.events.find((x) => x.name.includes('サンプルの儀式'));
    expect(e?.boss).toBe('ボスサンプル');
    expect(e?.color).toBe('#eb0043');
    // キャラ名が本文に無ければ従来どおり(boss なし・「」の中をキャラ名とみなす)
    const plain = parseArticle({ id: 'B_6', title: '超究極クエスト「単独」が登場！', published: '2026-10-20', lines: ['# 超究極クエスト「単独」が登場！', '▼出現期間', '2026年10月30日（金）12:00～11月30日（月）11:59'], bossColors: [['単独', '#007d32']] });
    expect(plain.events[0]?.boss).toBeUndefined();
    expect(plain.events[0]?.color).toBe('#007d32');
  });

  it('boss: 行ラベルはキャラ名(補足つきなら キャラ名（補足）)。並びもキャラ名で比べる', async () => {
    const { superUltimateLabel } = await import('../src/label');
    expect(superUltimateLabel('超究極クエスト「サンプルの儀式」が登場!', 'ボスサンプル')).toBe('ボスサンプル');
    expect(superUltimateLabel('超究極クエスト「サンプルの儀式」が登場!')).toBe('サンプルの儀式');
    expect(superUltimateLabel('超究極・兵クエスト「サンプルの儀式」が登場!', 'ボスサンプル')).toBe('ボスサンプル（兵）');
  });

  it('buildExport が color を通す', async () => {
    const { buildExport } = await import('../src/data/export');
    const rec = { id: 'x', url: 'u', title: 't', category: 'event', categories: ['event'], published: '2026-10-21', fetched_at: '', lastmod: null, content_hash: '', parse_status: 'ok' as const, reward_until: null, events: [{ id: 'x#0', name: '超究極クエスト（サンプル）', label: 'l', start: '2026-10-21T00:00:00+09:00', end: '2026-10-22T00:00:00+09:00', raw: '', color: '#3154ef', boss: 'サンプル' }] };
    const out = buildExport([rec], '2026-10-21T00:00:00+09:00').months[0]?.events[0];
    expect(out?.color).toBe('#3154ef');
    expect(out?.boss).toBe('サンプル');
  });
});

describe('キャラクター名の属性色と超UP期間の表', () => {
  const gekiLines = [
    '# ガチャ「激・獣神祭」開催！',
    '▼開催期間',
    '2026年10月10日（土）12:00～10月13日（火）11:59',
    '▼排出対象の激・獣神祭限定キャラクター',
    'サクリファイス、ミライ',
    '# 特定キャラクターの排出確率が超UPする期間',
    '・第1弾',
    '期間：10/10 12:00～10/11 11:59',
    '対象キャラクター：サクリファイス、ミライ、ジュゲム',
    '・第2弾',
    '期間：10/11 12:00～10/12 11:59',
    '対象キャラクター：サクリファイス、いろは、アルカ',
  ];
  const spans: [string, string][] = [['サクリファイス', '#3154ef'], ['ミライ', '#007d32'], ['ジュゲム', '#a16800'], ['いろは', '#a237c3']];

  it('第N弾の期間と対象キャラクターを、ガチャ「」の項目に表の行として付け、属性色を名前ごとに持たせる', () => {
    const r = parseArticle({ id: 'G_1', title: 'ガチャ「激・獣神祭」10/10より開催！', published: '2026-10-09', lines: gekiLines, bossColors: spans });
    const block = r.events[0]?.details?.find((d) => d.label === '排出確率が超UPする期間');
    expect(block?.lines).toEqual(['第1弾 | 10/10 12:00〜10/11 11:59 | サクリファイス、ミライ、ジュゲム', '第2弾 | 10/11 12:00〜10/12 11:59 | サクリファイス、いろは、アルカ']);
    expect(block?.colors).toEqual({ サクリファイス: '#3154ef', ミライ: '#007d32', ジュゲム: '#a16800', いろは: '#a237c3' }); // 色の無い「アルカ」は載せない
    expect(tableOf(block?.lines ?? [])).toEqual({
      head: ['弾', '期間', 'キャラクター'],
      rows: [['第1弾', '10/10 12:00〜10/11 11:59', 'サクリファイス、ミライ、ジュゲム'], ['第2弾', '10/11 12:00〜10/12 11:59', 'サクリファイス、いろは、アルカ']],
    });
  });

  it('モンコレ・ジェネレーションの対象キャラ(名前の一覧)にも属性色を付ける。色の無い記事は colors なし', () => {
    const lines = ['# ガチャ「モンストジェネレーション 2013＆2014」', '▼開催期間', '2026年10月21日（水）12:00～10月22日（木）11:59', '▼排出対象の限定キャラクター', 'アグナムート、織田信長X'];
    const r = parseArticle({ id: 'G_2', title: 'ガチャ「モンストジェネレーション」', published: '2026-10-20', lines, bossColors: [['アグナムート', '#eb0043'], ['織田信長X', '#3154ef']] });
    expect(r.events[0]?.details?.[0]?.colors).toEqual({ アグナムート: '#eb0043', 織田信長X: '#3154ef' });
    expect(parseArticle({ id: 'G_3', title: 'ガチャ「モンストジェネレーション」', published: '2026-10-20', lines }).events[0]?.details?.[0]?.colors).toBeUndefined();
  });
});

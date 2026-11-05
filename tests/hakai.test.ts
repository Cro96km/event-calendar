import { describe, expect, it } from 'vitest';
import hakai from '../config/schedule/hakai.json';
import { checkHakai, configProblems } from '../src/hakai-check';
import { fixedFloors, pickFloors, questNameColor, withFixedFloors } from '../src/quest-color';

const cfg = (over: Partial<{ quests: { name: string; color: string }[]; schedules: { since: string; floors: { floor: number; quest: string }[] }[] }> = {}) => ({
  quests: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
  schedules: [{ since: '2000-01-01', floors: [{ floor: 6, quest: 'A' }] }],
  ...over,
});
const palette = { red: '#eb0043', blue: '#3154ef' };

describe('config/schedule/hakai.json の整合性(CIで新クエスト追加時の設定ミスを検出)', () => {
  it('実際の設定に矛盾が無い', () => {
    expect(configProblems()).toEqual([]);
  });
  it('固定の階層のクエストはすべて色の対応がある(表示名で色が引ける)', () => {
    for (const f of fixedFloors()) expect(questNameColor(f.name), f.name).toBeDefined();
  });
});

describe('configProblems', () => {
  it('問題なし', () => expect(configProblems(cfg(), palette)).toEqual([]));
  it('名前の重複・palette に無い色', () => {
    const p = configProblems(cfg({ quests: [{ name: 'A', color: 'red' }, { name: 'A', color: 'pink' }] }), palette);
    expect(p).toEqual(['quests の名前が重複しています: A', 'quests の色が palette にありません: A → pink']);
  });
  it('未定義のクエストの参照・階層番号の重複', () => {
    const p = configProblems(cfg({ schedules: [{ since: '2000-01-01', floors: [{ floor: 6, quest: 'A' }, { floor: 6, quest: 'Z' }] }] }), palette);
    expect(p).toEqual(['schedules(2000-01-01) の階層番号が重複しています: 6', 'schedules(2000-01-01) の 6階層が quests に無いクエストを参照しています: Z']);
  });
  it('since の形式・昇順', () => {
    const f = [{ floor: 6, quest: 'A' }];
    expect(configProblems(cfg({ schedules: [{ since: '2026/11/01', floors: f }] }), palette)[0]).toContain('YYYY-MM-DD');
    expect(configProblems(cfg({ schedules: [{ since: '2026-11-01', floors: f }, { since: '2026-10-01', floors: f }] }), palette)[0]).toContain('昇順');
  });
});

describe('pickFloors(開催ごとの階層。since の版)', () => {
  const s = [
    { since: '2000-01-01', floors: [{ floor: 6, quest: 'A' }] },
    { since: '2027-01-27', floors: [{ floor: 6, quest: 'B' }, { floor: 7, quest: 'A' }] },
  ];
  it('開催の開始日に since が当てはまる最後の版を使う。過去の開催は古い版のまま', () => {
    expect(pickFloors(s, '2026-10-27T12:00:00+09:00')).toEqual([{ floor: 6, name: 'Aの星墓' }]);
    expect(pickFloors(s, '2027-01-27T12:00:00+09:00').map((f) => f.name)).toEqual(['Bの星墓', 'Aの星墓']);
    expect(pickFloors(s).map((f) => f.name)).toEqual(['Bの星墓', 'Aの星墓']); // 省略時は最新
  });
  it('どの版も当てはまらなければ追加なし', () => {
    expect(pickFloors([{ since: '2030-01-01', floors: [{ floor: 6, quest: 'A' }] }], '2026-10-27')).toEqual([]);
  });
  it('withFixedFloors は開催の開始日を渡すと版が使われ、現在の設定で既存の6〜10階層は不変', () => {
    const block = { label: '本開催の1階層～5階層までのクエスト', lines: ['1階層：パライソの星墓'] };
    expect(withFixedFloors('「破界の星墓」', block, '2026-10-27T12:00:00+09:00').lines.slice(1)).toEqual(fixedFloors().map((f) => `${f.floor}階層：${f.name}`));
    expect(hakai.schedules.length).toBeGreaterThan(0);
  });
});

describe('checkHakai(新クエストの検出)', () => {
  const rec = (id: string, lines: string[], name = '「破界の星墓」が11/27より登場！ #1', start = '2026-11-27T12:00:00+09:00') => ({ id, events: [{ name, start, details: [{ label: '本開催の1階層～5階層までのクエスト', lines }] }] });

  it('色の対応が無い階層名を、最初の記事・開催日つきで返す(既知の名前・表記ゆれは返さない)', () => {
    const r = checkHakai([
      rec('20260101_1', ['1階層：パライソの星墓', '2階層：ティル・ナ・ノーグの星墓']),
      rec('20261125_1', ['1階層：新登場の星墓', '2階層：黄泉の星墓', '3階層：新登場の星墓']),
      rec('20261226_1', ['1階層：もう一つの星墓']),
    ]);
    expect(r.unknown).toEqual([
      { name: '新登場の星墓', article: '20261125_1', start: '2026-11-27' },
      { name: 'もう一つの星墓', article: '20261226_1', start: '2026-11-27' },
    ]);
    expect(r.problems).toEqual([]);
    expect(r.maxArticleFloor).toBe(3);
  });
  it('星墓以外の項目・階層クエスト以外のブロック・階層形式でない行は見ない。何も無ければ空', () => {
    const r = checkHakai([
      rec('a', ['1階層：未知の星墓'], '「別のクエスト」'),
      { id: 'b', events: [{ name: '「破界の星墓」', start: '2026-11-27', details: [{ label: '対象ステージ', lines: ['未知の獄'] }, { label: '本開催の1階層～5階層までのクエスト', lines: ['注記の行'] }] }] },
    ]);
    expect(r.unknown).toEqual([]);
    expect(r.maxArticleFloor).toBe(0);
  });
});

describe('境界値', () => {
  it('configProblems: 正規化後の重複(中黒・＆)と、上の名前を含む名前(照合で使われない)を検出', () => {
    const none = { schedules: [] };
    const dup = configProblems(cfg({ ...none, quests: [{ name: 'ティルナノーグ', color: 'red' }, { name: 'ティル・ナ・ノーグ', color: 'blue' }] }), palette);
    expect(dup).toEqual(['quests の名前が重複しています: ティル・ナ・ノーグ']);
    const unreachable = configProblems(cfg({ ...none, quests: [{ name: 'ラブ', color: 'red' }, { name: 'ラブライブ', color: 'blue' }] }), palette);
    expect(unreachable[0]).toContain('ラブライブ');
    expect(unreachable[0]).toContain('使われません');
  });

  it('pickFloors: since と同じ開始日は新しい版、前日(JST 0:00〜3:59 を含む)は古い版', () => {
    const s = [
      { since: '2000-01-01', floors: [{ floor: 6, quest: 'A' }] },
      { since: '2027-01-27', floors: [{ floor: 6, quest: 'B' }] },
    ];
    expect(pickFloors(s, '2027-01-27T00:00:00+09:00')[0]?.name).toBe('Bの星墓');
    expect(pickFloors(s, '2027-01-26T23:59:00+09:00')[0]?.name).toBe('Aの星墓');
  });

  it('withFixedFloors: 記事が6階層を載せていればその階層は追加せず、残りだけ追加', () => {
    const block = { label: '本開催の1階層～6階層までのクエスト', lines: ['1階層：パライソの星墓', '6階層：記事の星墓'] };
    const r = withFixedFloors('「破界の星墓」', block, '2026-10-27T12:00:00+09:00');
    expect(r.lines.filter((l) => l.startsWith('6階層'))).toEqual(['6階層：記事の星墓']);
    expect(r.lines).toHaveLength(2 + (fixedFloors().length - 1));
  });

  it('checkHakai: 正規化した名前で重複を除く。記事が固定の階層と同じ番号まで載せたら見直しを促す', () => {
    const rec = (lines: string[]) => ({ id: 'x', events: [{ name: '「破界の星墓」', start: '2026-11-27T12:00:00+09:00', details: [{ label: '本開催の1階層～5階層までのクエスト', lines }] }] });
    const r = checkHakai([rec(['1階層：新＆星の星墓', '2階層：新&星の星墓'])]);
    expect(r.unknown).toHaveLength(1);
    const clash = checkHakai([rec(['6階層：記事の星墓'])]);
    expect(clash.problems.some((p) => p.includes('見直してください'))).toBe(true);
    expect(checkHakai([rec(['5階層：パラノヴィアの星墓'])]).problems).toEqual([]);
  });
});

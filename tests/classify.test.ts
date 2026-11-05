import rulesJson from '../config/judge/rules.json';
import { describe, expect, it } from 'vitest';
import { classify, parseMark, parseRules, type Rule } from '../src/classify';

// 合成データのみ(実タイトル・本文は含めない)
const rules: Rule[] = [
  { name: 'r-off-cat', decision: 'off', category: ['collab'] },
  { name: 'r-off-word', decision: 'off', title_includes: ['AAA'] },
  { name: 'r-on-recurring', decision: 'on', min_count: 3 },
  { name: 'r-unsure', decision: 'unsure', title_includes: ['QQQ'] },
  { name: 'r-on', decision: 'on', category: ['event'], title_includes: ['BBB'] },
];
const c = (key: string, category = 'event', count = 1) => ({ key, category, count });

describe('classify', () => {
  it('上から評価し最初に一致したルールを採用、根拠名を返す', () => {
    expect(classify(c('xAAAx', 'collab'), rules)).toEqual({ decision: 'off', rule: 'r-off-cat' });
    expect(classify(c('BBB AAA'), rules)).toEqual({ decision: 'off', rule: 'r-off-word' });
    expect(classify(c('BBB'), rules)).toEqual({ decision: 'on', rule: 'r-on' });
    expect(classify(c('zzz', 'event', 3), rules)).toEqual({ decision: 'on', rule: 'r-on-recurring' });
  });
  it('条件は全て満たすとき一致(カテゴリ違いの語は一致しない)、どれにも一致しなければ unsure', () => {
    expect(classify(c('BBB', 'campaign'), rules)).toEqual({ decision: 'unsure', rule: null });
    expect(classify(c('zzz'), rules)).toEqual({ decision: 'unsure', rule: null });
    expect(classify(c('QQQ BBB'), rules)).toEqual({ decision: 'unsure', rule: 'r-unsure' });
  });
  it('設定の検証: 重複・不正decision・条件なしは投げる', () => {
    expect(parseRules({ rules })).toHaveLength(5);
    expect(() => parseRules({})).toThrow();
    expect(() => parseRules({ rules: [{ name: 'a', decision: 'on', min_count: 1 }, { name: 'a', decision: 'on', min_count: 1 }] })).toThrow('重複');
    expect(() => parseRules({ rules: [{ name: 'a', decision: 'maybe', min_count: 1 }] })).toThrow();
    expect(() => parseRules({ rules: [{ name: 'a', decision: 'on' }] })).toThrow('条件');
  });
  it('旧形式の印を解釈する(移行用)', () => {
    expect(parseMark('自動:on(a-b)')).toEqual({ decision: 'on', rule: 'a-b' });
    expect(parseMark('自動:?')).toEqual({ decision: 'unsure', rule: null });
    expect(parseMark('自動:off (gacha)')).toEqual({ decision: 'off', rule: 'gacha' });
    expect(parseMark('https://x')).toBeNull();
  });
});


describe('設定検証', () => {
  it('型不正・空配列・未知キー・不正min_countは投げる', () => {
    const bad = (r: object) => () => parseRules({ rules: [{ name: 'a', decision: 'on', ...r }] });
    expect(bad({ title_includes: 'x' })).toThrow();
    expect(bad({ category: [] })).toThrow();
    expect(bad({ min_count: 'a' })).toThrow();
    expect(bad({ min_count: 0 })).toThrow();
    expect(bad({ title_includes: ['x'], titel_includes: ['y'] })).toThrow('未知');
  });
});


describe('title_regex', () => {
  it('正規表現で順序付きに一致し、不正な式・空は拒否する', () => {
    const [r] = parseRules({ rules: [{ name: 'a', decision: 'on', title_regex: 'あ.*い' }] });
    expect(classify({ key: 'あxい', category: 'c', count: 1 }, [r as never]).decision).toBe('on');
    expect(classify({ key: 'いあ', category: 'c', count: 1 }, [r as never]).decision).toBe('unsure');
    expect(() => parseRules({ rules: [{ name: 'b', decision: 'on', title_regex: '(' }] })).toThrow('正規表現');
    expect(() => parseRules({ rules: [{ name: 'c', decision: 'on', title_regex: '' }] })).toThrow();
  });
});

describe('config/judge/rules.json', () => {
  const real = parseRules(rulesJson);
  const k = (key: string, category = 'campaign') => classify({ key, category, count: 1 }, real).decision;
  it('mission items are off even in quest categories', () => {
    expect(k('SNS投稿ミッション', 'event')).toBe('off');
    expect(k('「夜と昼を別つ双子ミッション」開催!', 'collab')).toBe('off');
    expect(k('ミッション期間限定', 'event')).toBe('off');
    expect(k('SNS投稿ミッション', 'event')).toBe('off');
  });
  it('期間限定〜ミッションは表示(on)', () => {
    expect(k('期間限定ミッション登場', 'event')).toBe('off');
    expect(k('期間限定「タイムシフト活用ミッション」開催!')).toBe('on');
    expect(k('期間限定「クエストサーチ活用ミッション」開催!')).toBe('on');
  });
  it('轟絶/黎絶/滅絶の初登場は表示', () => {
    expect(k('新黎絶クエスト（キャローネ）がより初登場！M4のライブ配信も！', 'event')).toBe('on');
    expect(k('新難易度【滅絶（めつぜつ）】クエスト（フィロソフィア）がより初登場！', 'event')).toBe('on');
    expect(k('黎絶 キャローネ降臨', 'event')).toBe('on'); // 見出し付き記事では候補キーが降臨名になる
    expect(k('【コラボ】新黎絶クエスト（X）がより初登場！', 'collab')).toBe('off');
  });
  it('招待感謝バッジは非表示', () => {
    expect(k('「招待感謝バッジ」の報酬を獲得しよう!')).toBe('off');
    expect(k('「招待感謝バッジ」の報酬を獲得しよう!', 'event')).toBe('off');
  });
  it('CM視聴ミッションは表示(on)', () => {
    expect(k('CM視聴ミッションでレアアイテム確率UP!')).toBe('on');
  });
  it('ゲーム内キャンペーン(見出し)は off、使用回数・ラッキーバルーン(個別項目)は on、オーブバックチャレンジは off', () => {
    expect(k('ゲーム内キャンペーン開催!', 'event')).toBe('off');
    expect(k('「イベントクエスト」を使用回数100回以上のキャラでクリアすると宝箱「+1」', 'event')).toBe('on');
    expect(k('≪モンスポット≫ラッキーバルーンで「オラゴン」の出現確率がアップ', 'event')).toBe('on');
    expect(k('「集めて使って!オーブバックチャレンジ」開催!', 'campaign')).toBe('off');
  });
  it('活用ミッションは on、案内見出し(〜をチェック!/紹介/について)と新キャラ紹介は off', () => {
    expect(k('「クエストサーチ活用ミッション」開催!')).toBe('on');
    for (const t of ['遊び方をチェック!', '新キャラクター3体の「X」を紹介!', 'ステージと報酬について', '報酬を受け取ろう!', '超・獣神祭の新限定キャラクター「X」登場!']) expect(k(t, 'event')).toBe('off');
    expect(k('「追憶の書庫」のクエストで金卵の排出率が「2倍」!', 'event')).toBe('on');
  });
  it('期間限定で登場!ミッションクリアで は off(クエスト)、通常の登場!ミッションクリアで は on', () => {
    expect(k('「A」「B」期間限定で登場！ミッションクリアで「C」も！', 'event')).toBe('off');
    expect(k('「A」が登場！ミッションクリアで★6確定ガチャも！', 'event')).toBe('on');
  });
  it('ラックボーナス優待キャンペーン は off', () => {
    expect(k('ラックボーナス優待キャンペーン開催!', 'event')).toBe('off');
  });
  it('登場+ミッションクリアで は on(gachaより前)、新イベント/SNSキャンペーン/ボイスセット/マンガ は off', () => {
    expect(k('「」が登場！ミッションクリアで★6確定ガチャも！', 'event')).toBe('on');
    expect(k('ミッションクリアで限定描き下ろし「」への獣神化・改を解放!', 'event')).toBe('off');
    for (const t of ['新イベント「X」開催！', 'SNSキャンペーン実施!', '「」のリポストキャンペーン', 'ボイスセット登場!', '桜フレームが期間限定で登場!', '「X」の引用ポストキャンペーン', '新イベントクエスト開催!', '「X」のマンガを公開中!', '2026年前期「ストライカーレコード」開催！']) expect(k(t, 'event')).toBe('off');
  });
  it('tower seasons off, but the combined tower item is not caught', () => {
    expect(k('「覇者の塔シーズンズ」開催!', 'event')).toBe('off');
    expect(k('【13周年感謝キャンペーン】「覇者の塔」「覇者の塔シーズンズ」が期間限定で登場！', 'event')).not.toBe('off');
  });
  it('ガチャ: 本体は on、ギフト・先行販売・シール・フレンド・誠くん・セット・詳細は off、コラボは本体のみ on', () => {
    for (const [t, c] of [['ガチャ「超・獣神祭」開催!', 'event'], ['ガチャ「呪術廻戦」開催!', 'collab'], ['「13周年轟絶感謝マルチガチャ」開催!', 'campaign']] as const) expect(k(t, c)).toBe('on');
    for (const [t, c] of [['「2026年10月のガチャギフト」詳細', 'event'], ['モンストWebショップでガチャを先行販売!', 'collab'], ['シールガチャ「呪術廻戦」詳細', 'collab'], ['フレンドガチャ詳細', 'collab'], ['「日替わり誠くんガチャ」開催!', 'collab'], ['新キャラ1体確定のガチャ&オーブのセットが期間限定で登場!', 'event'], ['ガチャ「X」詳細', 'collab'], ['★6確定ガチャ玉について', 'event'], ['「13周年轟絶感謝マルチガチャ」各期間', 'campaign'], ['13周年記念!ランク130、1300到達で「★6確定ガチャ」が引ける!', 'campaign']] as const) expect(k(t, c)).toBe('off');
  });
  it('ガチャ以外の項目は gacha ルールに巻き込まれない', () => {
    expect(k('モンストWebショップで「真獣神玉」を無料プレゼント!', 'campaign')).not.toBe('off');
    expect(classify({ key: '「未開の砂宮」が登場！ミッションクリアで★6確定ガチャも！', category: 'event', count: 1 }, real).rule).not.toBe('gacha-on');
    expect(classify({ key: 'お得に引ける「10連ガチャ値引き券」登場!', category: 'campaign', count: 1 }, real).rule).not.toBe('gacha-on');
    expect(k('新キャラ1体確定のガチャ&オーブのセットが期間限定で登場!', 'event')).not.toBe('on');
  });
});

describe('config/judge/rules.json の公開方針ルール', () => {
  const real = parseRules(rulesJson);
  const k = (key: string, category = 'event') => classify({ key, category, count: 1 }, real);
  it('モンストジェネレーション・モンパスお試しは表示、守護獣の初登場・獣神化の解禁告知は非表示', () => {
    expect(k('ガチャ「モンストジェネレーション」開催！')).toEqual({ decision: 'on', rule: 'monst-generation' });
    expect(k('ガチャ「モンストジェネレーション」開催！ 10連ガチャ値引き券対象！')).toEqual({ decision: 'on', rule: 'monst-generation' });
    expect(k('【イベント名】モンパスお試しキャンペーンが開催！', 'campaign')).toEqual({ decision: 'on', rule: 'monpass-trial' });
    expect(k('守護獣「サンプル」が初登場！').decision).toBe('off');
    expect(k('「サンプル」の獣神化・改が解禁！', 'update').decision).toBe('off');
    expect(k('「サンプル」の真獣神化が解禁！', 'update')).toEqual({ decision: 'off', rule: 'unlock-announce' });
  });
});

describe('原生の神殿 感謝の間', () => {
  const real = parseRules(rulesJson);
  it('原生の神殿の感謝の間は非表示。英雄の神殿の感謝の間は別項目(この規則では非表示にならない)', () => {
    expect(classify({ key: '「原生の神殿 感謝の間」登場', category: 'campaign', count: 1 }, real)).toEqual({ decision: 'off', rule: 'genshin-kansha' });
    expect(classify({ key: '「英雄の神殿」クエストに期間限定ステージ「感謝の間」が登場!', category: 'campaign', count: 1 }, real).rule).not.toBe('genshin-kansha');
  });
});

// 表示ラベルの短縮(DOMなし)。spec §4.3.1。表示のみで、選択/判断のキー(item)や正本は変えない。
import recurring from '../config/display/recurring.json';
import { CAMPAIGN_ORDER } from './sections';

/** 定例キーワード(config/display/recurring.json)。 */
export const RECURRING_KEYWORDS: readonly string[] = recurring.keywords;

/** ラベルの最大文字数。超えたら末尾を … で切る(全文はバーのツールチップ)。 */
const MAX_LABEL = 24;

/** 定例キーワードに一致すればそのキーワード。 */
export function recurringKeyword(name: string, keywords: readonly string[] = RECURRING_KEYWORDS): string | null {
  return keywords.find((k) => name.includes(k)) ?? null;
}

/** 定型句の除去。結果が空になるときは元の名前(連番除去のみ)を返す。 */
function trimBoilerplate(name: string): string {
  const base = name.replace(/\s+#\d+$/, '').trim();
  let s = base
    .replace(/^【[^】]*】\s*/, '') // 先頭の【…】(キャンペーン冠)
    .replace(/[(（](追記|追加情報)[:：][^)）]*[)）]/g, '') // 追記注記
    .replace(/(?<![「\d])\d{1,2}\/\d{1,2}(?![\d」])(?:\([月火水木金土日]\))?(\s*\d{1,2}時(\d{1,2}分)?)?(より|から)?/g, '') // 日付・時刻(期間は別に表示する。「1/2」等の括弧内の数値は残す)
    .trim();
  // 「…が期間限定で登場！クリアで…」「…を開催！」等の末尾の定型句(語頭では切らない)
  s = s.replace(/(?<=.)(?<!必ず)[がを]?(期間限定で)?(再)?(登場|出現|開催|実施)(する|します)?(?=[!！]|$).*$/, '');
  s = s.replace(/について$/, '').replace(/[!！]+$/, '').trim();
  return s || base;
}

/** ガント行・詳細に出す短いラベル。定例 > 定型句除去 > 長さ上限。 */
export function shortLabel(name: string, keywords: readonly string[] = RECURRING_KEYWORDS): string {
  const k = recurringKeyword(name, keywords);
  if (k) return k;
  const s = trimBoilerplate(name);
  const cps = [...s];
  return cps.length > MAX_LABEL ? `${cps.slice(0, MAX_LABEL - 1).join('')}…` : s;
}

/** 詳細パネルの項目名。定例 > 定型句除去。長さで省略しない(ユーザ指示)。括弧・句読点は付けない。 */
export function fullLabel(name: string, keywords: readonly string[] = RECURRING_KEYWORDS): string {
  return recurringKeyword(name, keywords) ?? stripMarks(trimBoilerplate(name).replace(/、/g, ''));
}

/** 超究極クエストのキャラ名と補足(兵・傑など。無ければ空)。キャラ名が取れなければ null。spec §4.3.5 */
export function superUltimateParts(name: string): { chara: string; kind: string } | null {
  const m = name.replace(/^【[^】]*】\s*/, '').match(/^超究極(?:・([^（(「]+?)クエスト|クエスト)?\s*(?:[（(]([^）)]+)[）)]|「([^」]+)」)/);
  const chara = (m?.[2] ?? m?.[3])?.trim();
  return m && chara ? { chara, kind: m[1] ?? '' } : null;
}

/** 表示名 `キャラ名（補足）`(補足が無ければ括弧ごと省く)。 */
export function superUltimateLabel(name: string): string | null {
  const p = superUltimateParts(name);
  return p === null ? null : p.kind ? `${p.chara}（${p.kind}）` : p.chara;
}

/** 2行目(説明)の最大文字数。 */
const MAX_DESC = 40;

export interface LabelLines {
  /** 1行目: 対象 */
  title: string;
  /** 2行目: 説明。分割できなければ null */
  desc: string | null;
}

const cut = (s: string, max: number): string => ([...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s);
const stripParticle = (s: string): string => s.replace(/^[のでがをにはも]/, '').trim();

/**
 * バー内の2行表示。spec §4.3.3。優先順:
 * 1. 定例キーワード: 1行目のみ。
 * 2. 定型句除去(§4.3.1)の後、先頭の 「」『』≪≫〈〉 の中身を対象(1行目)、残り(先頭の助詞「の/で/が…」を除く)を説明(2行目)。
 * 3. 先頭が並び順キーワード(config/display/campaign-order.json)ならそれを対象、残りを説明。
 * 4. 末尾の（…）/(…) は2行目へ(例: 超究極クエスト / （大黒天）)。
 * 分割した結果どちらかが空なら分割せず1行(従来のshortLabel)。
 */
function labelLinesRaw(
  name: string,
  keywords: readonly string[] = RECURRING_KEYWORDS,
  targets: readonly string[] = CAMPAIGN_ORDER,
): LabelLines {
  const k = recurringKeyword(name, keywords);
  if (k) return { title: k, desc: null };
  const s = trimBoilerplate(name);
  const split = (t: string, rest: string): LabelLines | null => {
    const d = stripParticle(rest);
    return t && d ? { title: cut(t, MAX_LABEL), desc: cut(d, MAX_DESC) } : null;
  };
  const br = s.match(/^(?:「([^」]+)」|『([^』]+)』|≪([^≫]+)≫|〈([^〉]+)〉)(.*)$/);
  if (br) {
    const r = split(br[1] ?? br[2] ?? br[3] ?? br[4] ?? '', br[5] ?? '');
    if (r) return r;
  }
  const t = targets.find((x) => s.startsWith(x));
  if (t) {
    const r = split(t, s.slice(t.length));
    if (r) return r;
  }
  const pm = s.match(/^(.+?)([(（][^()（）]+[)）])$/);
  if (pm) return { title: cut((pm[1] as string).trim(), MAX_LABEL), desc: cut(pm[2] as string, MAX_DESC) };
  return { title: cut(s, MAX_LABEL), desc: null };
}

/** 表示ラベルから括弧(中身は残す)と句読点を除く(ユーザ指示)。 */
const BRACKETS = /[「」『』≪≫〈〉]/g;
const stripMarks = (t: string): string => t.replace(BRACKETS, '').replace(/。/g, '').replace(/^[、\s]+|[、\s]+$/g, '');

/** ラベル表示では括弧(「」『』≪≫〈〉)と先頭末尾の「、」「。」を付けない(ユーザ指示)。 */
export function labelLines(
  name: string,
  keywords: readonly string[] = RECURRING_KEYWORDS,
  targets: readonly string[] = CAMPAIGN_ORDER,
): LabelLines {
  const r = labelLinesRaw(name, keywords, targets);
  return { title: stripMarks(r.title), desc: r.desc === null ? null : stripMarks(r.desc) };
}

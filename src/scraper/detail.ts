// 詳細ページ → 期間パーサ入力（テキスト化済みの行）。spec §4.2 前処理。
import { parse, HTMLElement, type Node } from 'node-html-parser';
import palette from '../../config/display/quest-colors.json';
import { normalizeText, type ArticleInput } from '../period';

const SKIP = new Set(['IMG', 'SOURCE', 'PICTURE', 'SCRIPT', 'STYLE']);
const BLOCK = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'SECTION', 'HR', 'H1', 'H4', 'H5', 'H6']);
const CELL = new Set(['TD', 'TH']);

class LineBuilder {
  readonly lines: string[] = [];
  private buf = '';

  add(text: string): void {
    this.buf += text.replace(/\s+/g, ' ');
  }

  flush(prefix = ''): void {
    const t = this.buf.trim();
    if (t) this.lines.push(prefix + t);
    this.buf = '';
  }
}

function walk(node: Node, b: LineBuilder): void {
  if (!(node instanceof HTMLElement)) {
    b.add(node.text);
    return;
  }
  const tag = node.tagName;
  if (SKIP.has(tag)) return;
  if (tag === 'BR') return b.flush();
  if (tag === 'H2' || tag === 'H3') {
    b.flush();
    node.childNodes.forEach((c) => walk(c, b));
    return b.flush('# ');
  }
  const isBlock = BLOCK.has(tag);
  if (isBlock) b.flush();
  node.childNodes.forEach((c) => walk(c, b));
  if (CELL.has(tag)) b.add(' ');
  if (isBlock) b.flush();
}

/** 本文HTML → 行。h2/h3 は行頭 `# `、表の行(tr)は1行に連結。 */
export function htmlToLines(bodyHtml: string): string[] {
  const b = new LineBuilder();
  parse(bodyHtml).childNodes.forEach((c) => walk(c, b));
  b.flush();
  return b.lines;
}

/** h2/h3 見出し内の `<a id>` を、正規化した見出し名で引けるようにする(同名は最初のもの)。自身にアンカーの無いh3は直前のh2のアンカーを使う(キャンペーン情報の節へ飛ぶ)。 */
function headingAnchors(body: HTMLElement): Record<string, string> {
  const anchors: Record<string, string> = {};
  let parent: string | null = null;
  for (const h of body.querySelectorAll('h2, h3')) {
    const own = h.querySelector('a[id]')?.getAttribute('id') ?? null;
    if (h.tagName === 'H2') parent = own;
    const id = own ?? (h.tagName === 'H3' ? parent : null);
    const name = normalizeText(h.text.replace(/\s+/g, ' ').trim());
    if (id && name && !(name in anchors)) anchors[name] = id;
  }
  return anchors;
}

/** 表のセル内の色付き span(`style="color: rgb(r, g, b)"`)のテキスト → `#rrggbb`(同じテキストは最初の色)。ピックアップ名の色など、公式の配色を写すために使う。 */
export function spanColors(body: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  // 表のセル内だけ(本文の注意書きなど表外の同名・別目的の色を拾わない)。キーは走査した文字列なので、__proto__ 等も own プロパティとして扱う
  for (const s of body.querySelectorAll('td span, th span')) {
    const m = /(?<![-\w])color:\s*rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/.exec(s.getAttribute('style') ?? '');
    const text = s.text.replace(/\s+/g, ' ').trim();
    if (!m || text === '' || text.length > 40 || Object.hasOwn(out, text)) continue;
    const hex = [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
    Object.defineProperty(out, text, { value: `#${hex}`, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

const ATTR_COLORS = new Set(Object.values(palette.palette).map((c) => c.toLowerCase()));

/**
 * 本文中の色付き span のうち、公式の属性色(赤・青・緑・黄・紫の5色)のものを、出現順に `[テキスト, #rrggbb]` で返す(表の外も含む)。
 * 超究極・絶級のボス名の色を取るために使う(`spanColors` は表のセル内だけ)。
 */
export function attributeColors(body: HTMLElement): [string, string][] {
  const out: [string, string][] = [];
  for (const s of body.querySelectorAll('span')) {
    const m = /(?<![-\w])color:\s*rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/.exec(s.getAttribute('style') ?? '');
    const text = s.text.replace(/\s+/g, ' ').trim();
    if (!m || text === '' || text.length > 40) continue;
    const hex = `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
    if (ATTR_COLORS.has(hex)) out.push([text, hex]);
  }
  return out;
}

export function parseDetail(id: string, html: string): ArticleInput | null {
  const root = parse(html);
  const body = root.querySelector('.news-detail__body');
  const published = root.querySelector('.news-detail time')?.getAttribute('datetime');
  if (!body || !published) return null;
  return {
    id,
    title: (root.querySelector('h1.news-detail__title')?.text ?? '').replace(/\s+/g, ' ').trim(),
    published,
    lines: htmlToLines(body.innerHTML),
    anchors: headingAnchors(body),
    colors: spanColors(body),
    bossColors: attributeColors(body),
  };
}

/**
 * 変更検知用の内容(content_hash の元)。本文(`.news-detail__body`)・タイトル・公開日だけ。
 * ページ全体のHTMLはヘッダ・フッタ・関連記事など本文と無関係な部分が取得のたびに変わり、記事が変わっていなくてもハッシュが毎回変わって差分が出るため。
 * 本文が見つからないページだけ、HTML全体にする。
 */
export function contentKey(html: string): string {
  const root = parse(html);
  const body = root.querySelector('.news-detail__body');
  if (!body) return html;
  const title = (root.querySelector('h1.news-detail__title')?.text ?? '').replace(/\s+/g, ' ').trim();
  const published = root.querySelector('.news-detail time')?.getAttribute('datetime') ?? '';
  return JSON.stringify([title, published, body.innerHTML]);
}

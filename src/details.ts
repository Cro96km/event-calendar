// 記事本文の「対象ステージ/クエスト」ブロックの抽出と、ノーマルクエストの対象属性の算出(DOMなし)。spec §4.7。
// 保存するのはステージ名・日付・属性の短い項目のみ(本文の文章は保存しない)。
import normalQuest from '../config/schedule/normal-quest-attributes.json';
import { JST_OFFSET_MS, WEEKDAYS, padDateTime, padMonthDay } from './jst';

export interface DetailBlock {
  /** 見出し(例: 本開催の「禁忌の獄～深淵〜」対象ステージ) */
  label: string;
  lines: string[];
  /** 表の対象名 → 公式の色 `#rrggbb`(ガチャ開催スケジュールのピックアップ名) */
  colors?: Record<string, string>;
}

export interface RawBlock extends DetailBlock {
  /** ブロックが属する見出し(h2/h3)の生テキスト。見出し前なら null */
  heading: string | null;
}

/** 抽出対象の▼見出し。 */
/** 見出しの後ろの注記(`（追記：4/24）`)は許す(ラベルには含めない)。 */
const LABEL_RE = /^▼\s*(.*(?:対象ステージ|階層.*クエスト|対象クエスト|メンテナンス内容))(?:\s*[（(][^）)]*[）)])?\s*$/;
const DATE_ROW_RE = /^\d{1,2}\/\d{1,2}\([月火水木金土日]\)/;
const DATE_ONLY_RE = /^\d{1,2}\/\d{1,2}\([月火水木金土日]\)$/;
/** 項目の最大文字数。 */
const MAX_ITEM = 40;
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** 全角・半角をそろえ、日付 `12月9日（火）` を `12/9(火)` にする(古い記事の表記)。 */
const dateForm = (s: string): string => clean(s.normalize('NFKC')).replace(/^(\d{1,2})月(\d{1,2})日(?=\()/, '$1/$2');

/** ブロック内の1行 → 項目。項目でない行は null(ブロックの終わり)。 */
function itemOf(raw: string): string | null {
  const line = clean(raw);
  const item = line.startsWith('・') ? clean(line.slice(1)) : /^\d+階層\s*[：:]/.test(line) ? line : DATE_ROW_RE.test(dateForm(line)) ? dateForm(line) : null;
  // 注意書きなど文章は項目にしない(短い名称・日付行のみ保存する。spec §4.7)
  return item === null || item.length > MAX_ITEM || item.includes('。') ? null : item;
}

/** 表の見出し行・注記など。 */
const isTableHeader = (line: string): boolean => /^日付(\s|$)/.test(line);

/** コラボ記事の「ガチャ開催スケジュール」(ピックアップ別の期間の表)の見出し。 */
export const SCHEDULE_LABEL = 'ガチャ開催スケジュール';
/** ピックアップのイベントに付ける、そのピックアップの全ての回の表(`対象 | 期間`)。詳細パネルでクリックした回の行を強調する。 */
export const PICKUP_SCHEDULE_LABEL = 'ピックアップスケジュール';
export const isScheduleHeading = (s: string): boolean => /^ガチャ(?:開催)?スケジュール$/.test(clean(s.normalize('NFKC')));

const DATE_PART = String.raw`(?:\d{4}/)?\d{1,2}/\d{1,2}`;
/** `10/18 12:00〜10/19 11:59` / `2026/1/1 0:00〜1/2 11:59（※）`(〜統一・半角化後)。 */
const PERIOD_PART = String.raw`${DATE_PART} \d{1,2}:\d{2}〜(?:${DATE_PART} )?\d{1,2}:\d{2}(?:[(（]※[)）])?`;
const SCHEDULE_ROW_RE = new RegExp(String.raw`^(?:(.+?) )?(${PERIOD_PART})$`);
const PERIOD_ONLY_RE = new RegExp(String.raw`^${PERIOD_PART}$`);
/** 表の見た目を保つため、対象名は変えない(波ダッシュの統一と全角数字・コロンの半角化のみ)。 */
const normalizeRow = (s: string): string =>
  clean(s.replace(/[～〜~]/g, '〜').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/：/g, ':'));

/** 既定の行(`コラボキャラクター5体が排出対象`)の対象名は「通常ガチャ」と表示する(ピックアップの行と区別する)。 */
const scheduleName = (s: string): string => (/^コラボキャラクター\d+体が排出対象$/.test(s) ? '通常ガチャ' : s);

/**
 * 「ガチャ開催スケジュール」の表の行を `対象 | 期間` にする(対象の繰り返しは各行に持つ)。
 * 行の形: `対象  期間` / `期間`(直前の対象の続き) / `対象`のみ(次行が期間)。表でない行で終わる。
 */
function scheduleRows(lines: string[], from: number): { rows: string[]; next: number } {
  const rows: string[] = [];
  let name = '';
  let j = from;
  for (; j < lines.length; j++) {
    const raw = lines[j] as string;
    if (raw.startsWith('# ') || raw.startsWith('▼')) break;
    const l = normalizeRow(raw);
    const m = SCHEDULE_ROW_RE.exec(l);
    if (m) {
      if (m[1] !== undefined) name = scheduleName(m[1]);
      rows.push(`${name} | ${(m[2] as string).replace(/[(（]※[)）]/g, '')}`);
      continue;
    }
    // 対象名のみの行(次の行が期間のとき)
    const next = lines[j + 1];
    if (l.length <= MAX_ITEM && !l.includes('。') && !l.startsWith('※') && !/期間|期限/.test(l) && next !== undefined && PERIOD_ONLY_RE.test(normalizeRow(next))) {
      name = scheduleName(l);
      continue;
    }
    break;
  }
  return { rows, next: j };
}

/** ガチャの対象キャラクターの見出し(▼排出対象の限定キャラクター)。キャラ名のみ(`、`区切り)を保存する。 */
const CHARA_LABEL_RE = /^▼\s*(排出対象の限定キャラクター)\s*$/;

/** ガチャ記事の「▼対象キャラクター」(キャラクター・レアリティ・属性の表)。 */
export const CHARA_TABLE_LABEL = '対象キャラクター';
const CHARA_TABLE_RE = /^▼\s*対象キャラクター\s*$/;
const CHARA_ROW_RE = /^(.+?)\s+(★\d\S*)(?:\s+([火水木光闇無]))?$/;
const ATTR_ONLY_RE = /^[火水木光闇無]$/;

/**
 * 表の行を `名前 | レアリティ | 属性` にする(ヘッダ行は読み飛ばす)。属性が次の行に分かれた行(`名前 ★6` / `光`)は合わせる。
 * 表でない行(※・見出し・▼)で終わる。
 */
function charaTableRows(lines: string[], from: number): { rows: string[]; next: number } {
  const rows: { name: string; rarity: string; attr: string }[] = [];
  let j = from;
  for (; j < lines.length; j++) {
    const raw = lines[j] as string;
    if (raw.startsWith('# ') || /^[▼※◎]/.test(clean(raw))) break;
    const l = clean(raw);
    if (/^キャラクター\s+レアリティ/.test(l)) continue;
    const m = CHARA_ROW_RE.exec(l);
    if (m) {
      rows.push({ name: m[1] as string, rarity: m[2] as string, attr: m[3] ?? '' });
      continue;
    }
    const last = rows[rows.length - 1];
    if (ATTR_ONLY_RE.test(l) && last && last.attr === '') {
      last.attr = l;
      continue;
    }
    break;
  }
  return { rows: rows.map((r) => `${r.name} | ${r.rarity} | ${r.attr}`), next: j };
}

/** `、`で区切る。括弧（）「」の中の `、` では区切らない。 */
function splitNames(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if ('（(「『'.includes(ch)) depth++;
    else if ('）)」』'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === '、' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(clean).filter((x) => x !== '');
}

/** 見出し直後の行から、`、`区切りのキャラ名を集める。見出し・▼・◎・※・文章(。を含む/長い)で終わる。名前を取った後、`、`の無い行(表の見出し等)は含めない。 */
function charaNames(lines: string[], from: number): { names: string[]; next: number } {
  const names: string[] = [];
  let j = from;
  for (; j < lines.length; j++) {
    const l = clean(lines[j] as string);
    if (l === '' || (lines[j] as string).startsWith('# ') || /^[▼◎※]/.test(l) || l.includes('。')) break;
    if (names.length > 0 && !l.includes('、')) break;
    const items = splitNames(l);
    if (items.some((x) => x.length > MAX_ITEM)) break;
    names.push(...items);
  }
  return { names, next: j };
}

/** 本文の行(h2/h3 は行頭 `# `)から対象ステージ/クエスト・ガチャ開催スケジュール・対象キャラのブロックを抽出する。 */
export function extractBlocks(lines: string[]): RawBlock[] {
  const out: RawBlock[] = [];
  let heading: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (isScheduleHeading(line.startsWith('# ') ? line.slice(2) : line)) {
      const r = scheduleRows(lines, i + 1);
      if (r.rows.length > 0) out.push({ label: SCHEDULE_LABEL, heading, lines: r.rows });
      i = r.next - 1;
      continue;
    }
    if (line.startsWith('# ')) {
      heading = clean(line.slice(2));
      continue;
    }
    if (CHARA_TABLE_RE.test(clean(line))) {
      const r = charaTableRows(lines, i + 1);
      if (r.rows.length > 0) out.push({ label: CHARA_TABLE_LABEL, heading, lines: r.rows });
      i = r.next - 1;
      continue;
    }
    const cm = CHARA_LABEL_RE.exec(clean(line));
    if (cm) {
      const r = charaNames(lines, i + 1);
      if (r.names.length > 0) out.push({ label: clean(cm[1] as string), heading, lines: r.names });
      i = r.next - 1;
      continue;
    }
    const m = LABEL_RE.exec(clean(line));
    if (!m) continue;
    const items: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j] as string;
      if (l.startsWith('# ') || l.startsWith('▼')) break;
      if (isTableHeader(clean(l))) continue;
      let item = itemOf(l);
      if (item === null) break;
      // 表のセルが次の行に分かれている(日付のみの行 + 属性の行)
      const next = lines[j + 1];
      if (DATE_ONLY_RE.test(item) && next !== undefined && /属性/.test(next) && itemOf(next) === null && !next.startsWith('# ')) {
        item = `${item} ${clean(next)}`;
        j++;
      }
      items.push(item);
    }
    if (items.length > 0) out.push({ label: clean(m[1] as string), heading, lines: items });
    i = j - 1;
  }
  return out;
}

const ATTRS = normalQuest.weekdays as Record<string, string[]>;

const jstDate = (ms: number): Date => new Date(ms + JST_OFFSET_MS);

/** ノーマルクエストの経験値アップ(名称に「ノーマルクエスト」と「経験値」)か。 */
export function isNormalQuestExp(name: string): boolean {
  return name.includes('ノーマルクエスト') && name.includes('経験値');
}

/**
 * ノーマルクエストの対象属性(曜日ごとに決まっている。config/schedule/normal-quest-attributes.json)を期間の日付ごとに展開する。
 * 日付はJST暦日(0:00切替)。終了が無ければ開始日のみ。
 */
export function normalQuestBlock(event: { name: string; start: string; end: string | null }): DetailBlock | null {
  if (!isNormalQuestExp(event.name)) return null;
  const first = jstDate(Date.parse(event.start));
  const lastMs = event.end === null ? Date.parse(event.start) : Math.max(Date.parse(event.start), Date.parse(event.end) - 60_000);
  const last = jstDate(lastMs);
  const lines: string[] = [];
  const day = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  const lastDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  for (; day.getTime() <= lastDay && lines.length < 62; day.setUTCDate(day.getUTCDate() + 1)) {
    const wd = WEEKDAYS[day.getUTCDay()] as string;
    const attrs = ATTRS[wd] ?? [];
    lines.push(`${String(day.getUTCMonth() + 1).padStart(2, '0')}/${String(day.getUTCDate()).padStart(2, '0')}(${wd}) ${attrs.length ? `${attrs.join('・')}属性クエスト` : '対象属性なし'}`);
  }
  return { label: '対象クエスト', lines };
}

export interface DetailTable {
  head: string[];
  rows: string[][];
}

/** 全行が `M/D(曜) 属性` なら日付・曜日・対象属性の表、全行が `N階層：名` なら階層・クエストの表にする。それ以外(箇条書き)は null。 */
export function tableOf(lines: readonly string[]): DetailTable | null {
  if (lines.length === 0) return null;
  // 対象キャラクター: `名前 | レアリティ | 属性`
  const chara = lines.map((l) => /^(.+) \| (★[^|]+) \| (.*)$/.exec(l));
  if (chara.every((m) => m)) return { head: ['キャラクター', 'レアリティ', '属性'], rows: chara.map((m) => [m?.[1] as string, m?.[2] as string, m?.[3] as string]) };
  // ガチャ開催スケジュール: `対象 | 期間`。対象が前の行と同じなら空欄(表の縦結合の見た目)
  const sched = lines.map((l) => /^(.*) \| (.*\d{1,2}:\d{2}〜.+)$/.exec(l));
  if (sched.every((m) => m)) {
    let prev = '';
    return {
      head: ['対象', '期間'],
      rows: sched.map((m) => {
        const name = m?.[1] as string;
        const cell = name === prev ? '' : name;
        prev = name;
        return [cell, padDateTime(m?.[2] as string)];
      }),
    };
  }
  const dates = lines.map((l) => /^(\d{1,2}\/\d{1,2})\(([月火水木金土日])\)\s+(.+)$/.exec(l));
  if (dates.every((m) => m)) return { head: ['日付', '曜日', '対象属性'], rows: dates.map((m) => [padMonthDay(m?.[1] as string), m?.[2] as string, (m?.[3] as string).replace(/クエスト$/, '')]) };
  const floors = lines.map((l) => /^(\d+階層)\s*[：:]\s*(.+)$/.exec(l));
  if (floors.every((m) => m)) return { head: ['階層', 'クエスト'], rows: floors.map((m) => [m?.[1] as string, m?.[2] as string]) };
  return null;
}

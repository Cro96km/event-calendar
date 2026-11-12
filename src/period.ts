// 期間抽出（純関数）。spec §4.2。入力はテキスト化済みの行（h2/h3 見出しは行頭 `# `）。
import { CHARA_TABLE_LABEL, extractBlocks, isScheduleHeading, PICKUP_SCHEDULE_LABEL, SCHEDULE_LABEL, type DetailBlock } from './details';
import { WEEKDAYS } from './jst';
import { superUltimateParts } from './label';

export type ParseStatus = 'ok' | 'partial' | 'none';

export interface Slot {
  start: string;
  end: string | null;
}

/** コラボガチャのピックアップの1回分(ガチャ開催スケジュールの表由来)。通常ガチャの行(main)の直下に並べる。 */
export interface PickupInfo {
  /** 表示名(`ユルピックアップ` → `ユル`) */
  name: string;
  /** 表での登場順(0始まり) */
  order: number;
  /** 公式サイトでの表示色 `#rrggbb`(記事HTMLの色付きテキスト)。無ければ省略 */
  color?: string;
  /** 通常ガチャ(スケジュールの表を持つ項目)のid。表示/非表示の判断(候補キー)を通常ガチャと同じにするために使う */
  mainId: string;
}

export interface PeriodEvent {
  id: string;
  name: string;
  label: string;
  start: string;
  end: string | null;
  raw: string;
  /** 同一見出し内で全体期間に含まれる日別枠（個別eventにはしない） */
  slots?: Slot[];
  /** 名称が見出しでなく記事タイトル由来(候補キーは記事タイトルになる)。spec §4.5 */
  title_named?: true;
  /** 項目自身に期間が無く、記事の主期間(events[0])を継承したもの。spec §4.5 */
  inherited?: true;
  /** 見出し(h2/h3)内の `<a id>`。公式記事URLの `#anchor` で該当項目へ飛ぶ */
  anchor?: string;
  /** 記事本文の対象ステージ/クエスト(短い項目のみ)。spec §4.7 */
  details?: DetailBlock[];
  /** コラボガチャのピックアップの回(§4.3.8)。名前は `ガチャ「作品｜ピックアップ名」` */
  pickup?: PickupInfo;
  /** 超究極・絶級のボス名の公式の色 `#rrggbb`(行ラベルの文字に使う。バーは既定)。無ければ省略 */
  color?: string;
  /** 超究極が `超究極クエスト「クエスト名」` の形で、題名にキャラ名が無いとき、本文の `クエスト名（★5 キャラ名）` から取ったボスのキャラ名。行ラベルに使う。無ければ省略 */
  boss?: string;
}

/** 記事URL + 項目のアンカー(あれば) */
export function eventUrl(url: string, ev: { anchor?: string }): string {
  return ev.anchor ? `${url}#${ev.anchor}` : url;
}

export interface ArticleInput {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  published: string;
  lines: string[];
  /** 正規化済み見出し名 → 見出し内のアンカーid */
  anchors?: Record<string, string>;
  /** 色付き span のテキスト → `#rrggbb`(ピックアップ名の色。名前→色のみで本文は持たない) */
  colors?: Record<string, string>;
  /** 本文中の属性色(5色)の色付きテキスト `[テキスト, #rrggbb]`(出現順)。超究極・絶級のボス名の色用 */
  bossColors?: [string, string][];
}

export interface ParsedArticle {
  parse_status: ParseStatus;
  events: PeriodEvent[];
  reward_until: string | null;
  warnings: string[];
}

/** メンテナンスの実施日程見出し(`▼メンテナンス実施日程`)。 */
const isMaintenanceLabel = (label: string): boolean => label.includes('メンテナンス') && /日程|日時|期間/.test(label);

/** メンテナンス記事の項目名。`Ver.33.0アップデートメンテナンス` / `メンテナンス`。 */
function maintenanceName(title: string): string {
  const v = /Ver\.\d+(?:\.\d+)*/.exec(title);
  return v ? `${v[0]}アップデートメンテナンス` : 'メンテナンス';
}

/** 轟絶/黎絶/滅絶の降臨スケジュールの見出し(`▼初出現日時`)。 */
const RAID_LABEL = '初出現日時';
const RAID_TITLE_RE = /(轟絶|黎絶|滅絶)(?:[（(][ぁ-ん]+[）)])?】?(?:クエスト)?\s*[（(]([^）)]+)[）)]/;

/** 記事タイトルから降臨名(`黎絶 キャローネ降臨`)。轟絶/黎絶/滅絶のタイトルでなければ null。 */
export function raidName(title: string): string | null {
  const m = RAID_TITLE_RE.exec(title);
  return m ? `${m[1]} ${m[2]}降臨` : null;
}

const MIN = 60_000;
const DAY_MS = 24 * 60 * MIN;

const DATE = '(?:(\\d{4})年)?(\\d{1,2})[月/](\\d{1,2})日?(?:\\(([月火水木金土日])\\))?';
const TIME = '(\\d{1,2}):(\\d{2})(?:頃)?'; // メンテナンスは「0:00頃〜5:00頃」
const RANGE_RE = new RegExp(`${DATE}\\s*(?:${TIME})?\\s*〜\\s*(?:${DATE})?\\s*(?:${TIME})?`);
const END_ONLY_RE = new RegExp(`${DATE}\\s*${TIME}\\s*まで`);

/** NFKC・区切り統一・`12時00分`→`12:00`・修飾語除去 */
export function normalizeText(s: string): string {
  return s
    .replace(/[～〜~－−]/g, '〜')
    .normalize('NFKC')
    .replace(/(?<=\d)\s*ー\s*(?=\d{1,2}[:月/])/g, '〜')
    .replace(/(\d{1,2})時(\d{1,2})分/g, (_, h: string, m: string) => `${h}:${m.padStart(2, '0')}`)
    .replace(/(\d{1,2})時(?!間)/g, '$1:00')
    .replace(/頃|の間で常時出現|\(※\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Parts {
  year: number | null;
  month: number;
  day: number;
  weekday: string | undefined;
}

function datePartsAt(m: RegExpMatchArray, i: number): Parts | null {
  if (m[i + 1] === undefined) return null;
  if (Number(m[i + 1]) > 12 || Number(m[i + 2]) > 31) return null;
  return {
    year: m[i] === undefined ? null : Number(m[i]),
    month: Number(m[i + 1]),
    day: Number(m[i + 2]),
    weekday: m[i + 3],
  };
}

const wall = (y: number, mo: number, d: number, h: number, mi: number): number =>
  Date.UTC(y, mo - 1, d, h, mi);

/** JST壁時計(UTCとして保持したms) → ISO8601 +09:00。24:00 は翌日00:00になる */
function toIso(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16)}:00+09:00`;
}

function inferYear(p: Parts, h: number, mi: number, published: string): number {
  if (p.year !== null) return p.year;
  const pub = Date.parse(`${published}T00:00:00Z`);
  const year = Number(published.slice(0, 4));
  return wall(year, p.month, p.day, h, mi) < pub - 180 * DAY_MS ? year + 1 : year;
}

function checkWeekday(p: Parts, year: number, warnings: string[], raw: string): void {
  if (p.weekday === undefined) return;
  const actual = WEEKDAYS[new Date(Date.UTC(year, p.month - 1, p.day)).getUTCDay()];
  if (actual !== p.weekday) warnings.push(`曜日不一致: ${raw} (${p.weekday} → 実際は${actual})`);
}

interface Resolved {
  start: number;
  end: number | null;
  raw: string;
}

function resolveRange(m: RegExpMatchArray, published: string, warnings: string[]): Resolved | null {
  const a = datePartsAt(m, 1);
  if (a === null) return null;
  const sh = m[5] === undefined ? 0 : Number(m[5]);
  const smi = m[6] === undefined ? 0 : Number(m[6]);
  const sy = inferYear(a, sh, smi, published);
  checkWeekday(a, sy, warnings, m[0]);
  const start = wall(sy, a.month, a.day, sh, smi);

  const b = datePartsAt(m, 7);
  if (b === null && m[11] === undefined) return { start, end: null, raw: m[0] };

  // 終了が日付のみ(`〜11月4日(水)`)ならその日の終わり(23:59)まで。時刻のみ/終了なしは従来どおり
  const dateOnlyEnd = b !== null && m[11] === undefined;
  const eh = m[11] === undefined ? (dateOnlyEnd ? 23 : 0) : Number(m[11]);
  const emi = m[12] === undefined ? (dateOnlyEnd ? 59 : 0) : Number(m[12]);
  let end: number;
  if (b === null) {
    end = wall(sy, a.month, a.day, eh, emi);
    if (end < start) end += DAY_MS;
  } else {
    let ey = b.year ?? sy;
    end = wall(ey, b.month, b.day, eh, emi);
    if (b.year === null && end < start) end = wall(++ey, b.month, b.day, eh, emi);
    checkWeekday(b, ey, warnings, m[0]);
    if (end < start) warnings.push(`終了が開始より前: ${m[0]}`);
  }
  return { start, end, raw: m[0] };
}

function resolveEndOnly(m: RegExpMatchArray, published: string, warnings: string[]): number {
  const p = datePartsAt(m, 1) as Parts;
  const h = Number(m[5]);
  const mi = Number(m[6]);
  const y = inferYear(p, h, mi, published);
  checkWeekday(p, y, warnings, m[0]);
  return wall(y, p.month, p.day, h, mi);
}

const BARE_TIME_RE = /^(\d{1,2}):(\d{2})\s*〜\s*(\d{1,2}):(\d{2})$/;
const EXTRA_TIME_RE = /(\d{1,2}):(\d{2})\s*〜\s*(\d{1,2}):(\d{2})/g;

/** `10/30(金) 8:00〜9:00 12:00〜13:00` のように1行に同日の時間帯が続くとき、2つ目以降の時間帯。 */
function extraRanges(line: string, range: RegExpMatchArray, r: Resolved): Resolved[] {
  if (range[5] === undefined || range[11] === undefined || datePartsAt(range, 7) !== null || r.end === null) return [];
  const base = r.start - (Number(range[5]) * 60 + Number(range[6])) * MIN;
  let rest = line.slice((range.index ?? 0) + range[0].length);
  rest = rest.slice(0, rest.search(/\d{1,2}[月/]\d{1,2}/) < 0 ? undefined : rest.search(/\d{1,2}[月/]\d{1,2}/)); // 次の日付以降は別の範囲
  return [...rest.matchAll(EXTRA_TIME_RE)].map((x) => {
    const start = base + (Number(x[1]) * 60 + Number(x[2])) * MIN;
    const end = base + (Number(x[3]) * 60 + Number(x[4])) * MIN;
    return { start, end: end < start ? end + DAY_MS : end, raw: x[0] };
  });
}

/** 年代の表の行で、期間に続く年代(`2013&2014`・`2015`)の並び。正規化済みの行(`、`区切り)を受ける。 */
function erasAfter(line: string, range: RegExpMatchArray): { eras: string[]; unknown: string[] } {
  const rest = line.slice((range.index ?? 0) + range[0].length).replace(/[(][^)]*[)]/g, ' ').replace(/※.*$/, '');
  const tokens = rest.split(/[、,・\s]+/).filter((x) => x !== '');
  const isEra = (x: string): boolean => /^\d{4}(?:&\d{4})?$/.test(x);
  return { eras: tokens.filter(isEra), unknown: tokens.filter((x) => !isEra(x)) };
}

/** 日替わりピックアップ(`・Vol.N` / `期間：…` / `対象キャラ：…`)の1件。 */
interface VolBlock {
  n: number;
  start: number;
  end: number | null;
  raw: string;
  chars: string[];
}

function volBlocks(lines: string[], published: string, warnings: string[]): VolBlock[] {
  const out: VolBlock[] = [];
  let cur: { n: number; start?: number; end?: number | null; raw?: string; chars: string[] } | null = null;
  const flush = (): void => {
    if (cur !== null && cur.start !== undefined) out.push({ n: cur.n, start: cur.start, end: cur.end ?? null, raw: cur.raw ?? '', chars: cur.chars });
    cur = null;
  };
  for (const rawLine of lines) {
    const line = normalizeText(rawLine);
    const v = /^[・･]?\s*Vol\.?\s*(\d+)$/i.exec(line);
    if (v) {
      flush();
      cur = { n: Number(v[1]), chars: [] };
      continue;
    }
    if (cur === null) continue;
    const p = /^期間\s*:\s*(.+)$/.exec(line);
    const c = /^対象キャラ\s*:\s*(.+)$/.exec(line);
    if (p) {
      const m = RANGE_RE.exec(p[1] as string);
      const r = m ? resolveRange(m, published, warnings) : null;
      if (r) Object.assign(cur, { start: r.start, end: r.end, raw: r.raw });
    } else if (c) {
      cur.chars = (c[1] as string).split('、').map((x) => x.trim()).filter((x) => x !== '');
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/** 激・獣神祭の `・第N弾` / `期間：…` / `対象キャラクター：…` の1件。 */
interface BatchBlock {
  n: number;
  raw: string;
  chars: string[];
}

/** 特定キャラクターの排出確率が超UPする期間(第1弾〜)。`期間` と `対象キャラクター` が揃った弾だけ返す。 */
function batchBlocks(lines: string[], published: string, warnings: string[]): BatchBlock[] {
  const out: BatchBlock[] = [];
  let cur: { n: number; raw?: string; chars: string[] } | null = null;
  const flush = (): void => {
    if (cur !== null && cur.raw !== undefined && cur.chars.length > 0) out.push({ n: cur.n, raw: cur.raw, chars: cur.chars });
    cur = null;
  };
  for (const rawLine of lines) {
    const line = normalizeText(rawLine);
    const v = /^[・･]?\s*第(\d+)弾$/.exec(line);
    if (v) {
      flush();
      cur = { n: Number(v[1]), chars: [] };
      continue;
    }
    if (cur === null) continue;
    const p = /^期間\s*:\s*(.+)$/.exec(line);
    const c = /^対象キャラクター?\s*:\s*(.+)$/.exec(line);
    if (p) {
      const m = RANGE_RE.exec(p[1] as string);
      const r = m ? resolveRange(m, published, warnings) : null;
      if (r) cur.raw = r.raw;
    } else if (c) {
      cur.chars = (c[1] as string).split('、').map((x) => x.trim()).filter((x) => x !== '');
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/** 超UP期間の表のブロックの見出し。 */
export const BATCH_LABEL = '排出確率が超UPする期間';
/** キャラクター名の一覧のブロック(名前だけの行)。属性色を付ける対象。 */
const CHARA_NAME_LABELS = ['排出対象の限定キャラクター', '対象キャラ', BATCH_LABEL];

/** 激・獣神祭の超UP期間の表を、ガチャ「」の項目(無ければ主期間)に付ける。行は `第N弾 | 期間 | 名前、名前、…`。 */
function addBatchBlock(input: ArticleInput, events: PeriodEvent[], main: PeriodEvent | undefined, warnings: string[]): void {
  const batches = batchBlocks(input.lines, input.published, warnings);
  if (batches.length === 0) return;
  const host = events.find((e) => e.name.startsWith('ガチャ「')) ?? main;
  if (!host) return;
  (host.details ??= []).push({ label: BATCH_LABEL, lines: batches.map((b) => `第${b.n}弾 | ${b.raw} | ${b.chars.join('、')}`) });
}

/**
 * キャラクター名の一覧(排出対象・日替わりピックアップ・超UP期間)に、本文の属性色(赤・青・緑・黄・紫。色付き span)を名前→色で付ける。
 * 色の無い名前は載せない。本文は持たない。
 */
function addCharaColors(input: ArticleInput, events: PeriodEvent[]): void {
  const spans = input.bossColors ?? [];
  if (spans.length === 0) return;
  const color = new Map<string, string>();
  for (const [text, hex] of spans) if (!color.has(normalizeText(text))) color.set(normalizeText(text), hex);
  for (const e of events) {
    for (const d of e.details ?? []) {
      if (!CHARA_NAME_LABELS.includes(d.label)) continue;
      const names = d.label === BATCH_LABEL ? d.lines.flatMap((l) => (l.split(' | ')[2] ?? '').split('、')) : d.lines;
      const colors: Record<string, string> = {};
      for (const n of names) {
        const c = color.get(normalizeText(n.trim()));
        if (c !== undefined) Object.defineProperty(colors, n.trim(), { value: c, enumerable: true, writable: true, configurable: true });
      }
      if (Object.keys(colors).length > 0) d.colors = colors;
    }
  }
}

interface HeadingSection {
  label: string;
  first: PeriodEvent | null;
}

/** 見出し(h2/h3)1つ分の項目。期間を持たない告知項目の期間継承判定に使う。 */
interface Heading {
  name: string;
  hasEvent: boolean;
  /** 期間見出しではない日時を持つ(配信日時・解禁日程など)。継承すると誤るため除外 */
  hasOtherDate: boolean;
}

/** 告知らしい見出し(「…!」で終わる。末尾の(追記:…)注記は除く)。 */
const isAnnouncement = (name: string): boolean => /!\s*(?:\([^)]*\))?$/.test(name);

const isReward = (s: string): boolean => /受け?取/.test(s);

/**
 * 対象ステージ/クエストのブロックを項目に付ける。見出しが項目名と一致すればその項目、
 * 一致しない(見出し前・期間の無い見出し)ときはステージ/階層のブロックのみ記事の主期間(events[0])へ。
 */
function attachDetails(lines: string[], events: PeriodEvent[], main: PeriodEvent | undefined): void {
  for (const b of extractBlocks(lines)) {
    const { heading, ...block } = b;
    const owners = heading === null ? [] : events.filter((e) => normalizeText(e.name) === normalizeText(heading));
    // ガチャ開催スケジュール・対象キャラクターの表は、見出しが項目名と一致しなければ、記事の ガチャ「」 の項目(無ければ主期間)へ
    const gacha = events.find((e) => e.name.startsWith('ガチャ「')) ?? main;
    const gachaTable = block.label === SCHEDULE_LABEL || block.label === CHARA_TABLE_LABEL;
    const targets = owners.length > 0 ? owners : gachaTable && gacha ? [gacha] : /ステージ|階層|メンテナンス内容/.test(block.label) && main ? [main] : [];
    for (const e of targets) (e.details ??= []).push(block);
  }
}

/**
 * ▼見出しの無い期間ラベル(フォールバック用)。「開催期間」「キャンペーン開催期間」や、表ヘッダ「開催期間 対象の年代」。
 * 数字を含まない短い行だけ。
 */
const BARE_LABEL_RE = /^[^\d\s▼]{0,16}期間(?:\s[^\d\s]{1,16})*$/;
const isBareLabel = (s: string): boolean => BARE_LABEL_RE.test(s) && !isReward(s);

/**
 * 期間を解析する。▼見出し形式で何も取れなかった記事(none)だけ、▼の無い『期間』ラベル(表ヘッダ・見出し)の
 * 直後の期間を拾うフォールバックで解析し直す。従来 ok/partial の記事の結果は変わらない。
 */
/**
 * ガチャ開催スケジュールの表(details)から、ピックアップごと・回ごとのイベントを作る(通常ガチャの行は表を持つ項目のまま)。
 * 名前 `ガチャ「<作品>｜<ピックアップ名>」`。表に無い/期間を読めない行は作らない。
 */
function addPickups(input: ArticleInput, events: PeriodEvent[], warnings: string[]): void {
  const host = events.find((e) => e.details?.some((d) => d.label === SCHEDULE_LABEL));
  const block = host?.details?.find((d) => d.label === SCHEDULE_LABEL);
  const work = host ? /ガチャ「([^」]+)」/.exec(host.name)?.[1] : undefined;
  const nameOf = (key: string): string => key.replace(/ピックアップ$/, '').trim() || key;
  // 色: 名前(`ユル`)、無ければ表の対象名(`ユルピックアップ`)全体を囲む span。継承プロパティ(constructor 等)は見ない
  const own = (k: string): string | undefined => (input.colors && Object.hasOwn(input.colors, k) ? input.colors[k] : undefined);
  const colorOf = (key: string): string | undefined => own(nameOf(key)) ?? own(key);
  // 表の対象名 → 公式の色(表の対象名のセルに色を付ける)
  if (block) {
    const colors: Record<string, string> = {};
    for (const line of block.lines) {
      const key = /^(.*) \| /.exec(line)?.[1];
      const c = key === undefined ? undefined : colorOf(key);
      if (key !== undefined && c !== undefined) colors[key] = c;
    }
    if (Object.keys(colors).length > 0) block.colors = colors;
  }
  if (host && block && !work) warnings.push(`ピックアップ: 項目名に ガチャ「」 が無いため行を作らない: ${host.name}`);
  if (!host || !block || !work) return;
  let next = events.reduce((m, e) => Math.max(m, (Number(e.id.split('#')[1]) || 0) + 1), 0);
  const order = new Map<string, number>();
  const created: { event: PeriodEvent; key: string }[] = [];
  const groups = new Map<string, string[]>(); // 対象名 → そのピックアップの全ての回(`対象 | 期間`)
  for (const line of block.lines) {
    const m = /^(.*) \| (.+)$/.exec(line);
    if (!m || m[1] === '通常ガチャ') continue;
    const range = RANGE_RE.exec(normalizeText(m[2] as string));
    const r = range ? resolveRange(range, input.published, warnings) : null;
    if (!r) continue;
    const key = m[1] as string;
    if (!order.has(key)) order.set(key, order.size);
    const name = nameOf(key);
    const color = colorOf(key);
    groups.set(key, [...(groups.get(key) ?? []), line]);
    const ev: PeriodEvent = {
      id: `${input.id}#${next++}`,
      name: `ガチャ「${work}｜${name}」`,
      label: 'ピックアップ',
      start: toIso(r.start),
      end: r.end === null ? null : toIso(r.end),
      raw: r.raw,
      pickup: { name, order: order.get(key) as number, mainId: host.id, ...(color ? { color } : {}) },
    };
    events.push(ev);
    created.push({ event: ev, key });
  }
  // 各回に、そのピックアップの全期間の表を付ける(バーをクリックした詳細で、そのキャラの全スケジュールを表で見せる)
  for (const { event, key } of created) {
    const c = block.colors && Object.hasOwn(block.colors, key) ? block.colors[key] : undefined;
    event.details = [{ label: PICKUP_SCHEDULE_LABEL, lines: groups.get(key) as string[], ...(c ? { colors: { [key]: c } } : {}) }];
  }
}

/**
 * 超究極・絶級のボス名の公式の色(行ラベルの文字用)。ボス名: 超究極は項目名のキャラ名(`超究極・兵クエスト（ミザリー）`→ミザリー)、
 * 絶級は `轟絶/黎絶/滅絶` の後の名前。記事の属性色の色付きテキストのうち、ボス名を含む最初のものの色。無ければ付けない。
 */
function addBossColors(input: ArticleInput, events: PeriodEvent[]): void {
  // 超究極 `超究極クエスト「クエスト名」`: 「」の中はクエスト名で、キャラ名は本文の `クエスト名（★5 キャラ名）` にある(題名の「」をキャラ名と取り違えない)
  for (const e of events) {
    const quest = /^超究極クエスト「([^」]+)」/.exec(e.name.replace(/^【[^】]*】\s*/, ''))?.[1];
    if (!quest || e.label === RAID_LABEL) continue;
    const re = new RegExp(`${quest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[（(]\\s*★\\s*\\d+\\s*([^）)]+?)\\s*[）)]`);
    const hit = input.lines.map((l) => re.exec(l)?.[1]).find((x): x is string => x !== undefined && x !== '');
    if (hit) e.boss = hit;
  }
  const spans = input.bossColors ?? [];
  if (spans.length === 0) return;
  for (const e of events) {
    const boss = e.label === RAID_LABEL ? e.name.replace(/^(?:轟絶|黎絶|滅絶)\s*/, '').replace(/降臨$/, '').trim() : (e.boss ?? superUltimateParts(e.name)?.chara);
    if (!boss) continue;
    const hit = spans.find(([text]) => text.includes(boss));
    if (hit) e.color = hit[1];
  }
}

export function parseArticle(input: ArticleInput): ParsedArticle {
  const first = parseWith(input, false);
  if (first.parse_status !== 'none') return first;
  const second = parseWith(input, true);
  return second.parse_status === 'none' ? first : second;
}

function parseWith(input: ArticleInput, bareLabels: boolean): ParsedArticle {
  const warnings: string[] = [];
  const events: PeriodEvent[] = [];
  let rewardUntil: number | null = null;
  let name: string | null = null;
  let section: HeadingSection | null = null;
  /** section がフォールバックの期間ラベル(▼でない)で開いたもの */
  let bareOpen = false;
  /** 表ヘッダが「開催期間 対象の年代」: 各行の期間に続く年代(`2013&2014、2015`)ごとにイベントを作る */
  let eraTable = false;
  const headings: Heading[] = [];
  let heading: Heading | null = null;
  // 最初の期間の見出しが告知らしくない(「遊び方」等)とき、その見出し配下の期間は記事タイトルの項目として扱う
  let titleHeading: string | null = null;

  const noteReward = (ms: number): void => {
    if (rewardUntil === null || ms > rewardUntil) rewardUntil = ms;
  };

  /** 直前の「日付+時間帯」行の暦日0:00(ms)。次行以降の日付なし時間帯(`<br>`で改行された2回目以降)に使う */
  let slotBase: number | null = null;
  for (const rawLine of input.lines) {
    // ガチャ開催スケジュール(ピックアップ別の期間の表): 期間の見出しではない。以降の期間を日別枠に畳まない(表は details に出す)
    if (isScheduleHeading(rawLine.startsWith('# ') ? rawLine.slice(2) : rawLine)) {
      slotBase = null;
      section = null;
      // h2/h3 の見出しなら項目名を持ち越さない(次の▼の項目を前の見出しの名前にしない)
      if (rawLine.startsWith('# ')) {
        name = null;
        heading = null;
      }
      continue;
    }
    if (rawLine.startsWith('# ')) {
      slotBase = null;
      const text = normalizeText(rawLine.slice(2));
      if (bareLabels && isBareLabel(text)) {
        // 期間の見出し(「キャンペーン開催期間」)は項目名ではなく、記事全体の期間。名前は記事タイトルになる
        name = null;
        heading = null;
        section = { label: text, first: null };
        bareOpen = true;
        eraTable = false;
        continue;
      }
      // フォールバックでは、期間ラベル配下を別の見出しまで持ち越さない
      if (bareLabels) {
        section = null;
        bareOpen = false;
        eraTable = false;
      }
      name = text;
      heading = { name, hasEvent: false, hasOtherDate: false };
      headings.push(heading);
      continue;
    }
    const line = normalizeText(rawLine);
    if (line.startsWith('▼')) {
      const label = line.slice(1).replace(/[:：]?\s*(?:\d{4}年|\d{1,2}[月/]\d).*$/, '').trim();
      slotBase = null;
      bareOpen = false;
      eraTable = false;
      section = /期間|期限/.test(label) || isMaintenanceLabel(label) || (label === RAID_LABEL && raidName(input.title) !== null) ? { label, first: null } : null;
      // 見出し行に日時が同居していれば、そのまま下で解析する
      if (section === null || label === line.slice(1).trim()) continue;
    }

    if (bareLabels && !line.startsWith('▼') && isBareLabel(line)) {
      slotBase = null;
      section = { label: line.split(' ')[0] as string, first: null };
      bareOpen = true;
      eraTable = /年代/.test(line);
      continue;
    }

    const range = RANGE_RE.exec(line);
    const bare = range === null && section !== null && slotBase !== null ? BARE_TIME_RE.exec(line) : null;
    // フォールバックの期間ラベルは、直後(期間行の並び)が終わったら閉じる。期間の無いラベルが離れた日付を拾わない
    if (bareOpen && range === null && bare === null) {
      section = null;
      bareOpen = false;
      eraTable = false;
    }
    if (range === null && bare === null) {
      const end = END_ONLY_RE.exec(line);
      if (end === null) continue;
      if (heading) heading.hasOtherDate = true;
      const ms = resolveEndOnly(end, input.published, warnings);
      if (isReward(line) || (section !== null && isReward(section.label))) noteReward(ms);
      else warnings.push(`終了のみの期限(非表示): ${end[0]}`);
      continue;
    }
    if (section === null) {
      if (heading) heading.hasOtherDate = true;
      continue;
    }
    if (heading) heading.hasEvent = true;

    let ranges: Resolved[];
    if (range === null) {
      const x = bare as RegExpExecArray;
      const start = (slotBase as number) + (Number(x[1]) * 60 + Number(x[2])) * MIN;
      const end = (slotBase as number) + (Number(x[3]) * 60 + Number(x[4])) * MIN;
      ranges = [{ start, end: end < start ? end + DAY_MS : end, raw: x[0] }];
    } else {
      const first0 = resolveRange(range, input.published, warnings);
      if (first0 === null) continue;
      slotBase = range[5] !== undefined && range[11] !== undefined && datePartsAt(range, 7) === null ? first0.start - (Number(range[5]) * 60 + Number(range[6])) * MIN : null;
      ranges = [first0, ...extraRanges(line, range, first0)];
    }
    // 年代の表: 行の期間 × 年代ごとに1イベント(名前は ガチャ「<ガチャ名> <年代>」。日別枠の畳み込みはしない)
    // ガチャ名が取れない記事は年代別にしない(名前が年代だけになるため。従来どおり記事タイトルの項目)
    const brand = /ガチャ「([^」]+)」/.exec(input.title)?.[1];
    const parsedEras = eraTable && range !== null && brand ? erasAfter(line, range) : { eras: [], unknown: [] };
    const eras = parsedEras.eras;
    if (eras.length > 0 && brand) {
      if (parsedEras.unknown.length > 0) warnings.push(`年代を解釈できない: ${parsedEras.unknown.join(' ')} (${line})`);
      const r = ranges[0] as Resolved;
      for (const era of eras) {
        const evName = `ガチャ「${normalizeText(brand)} ${era.replace('&', '＆')}」`;
        const ev: PeriodEvent = {
          id: `${input.id}#${events.length}`,
          name: evName,
          label: section.label,
          start: toIso(r.start),
          end: r.end === null ? null : toIso(r.end),
          raw: r.raw,
          ...(input.anchors?.[normalizeText(evName)] ? { anchor: input.anchors[normalizeText(evName)] } : {}),
        };
        events.push(ev);
        section.first ??= ev;
      }
      continue;
    }
    for (const r of ranges) {
      const start = toIso(r.start);
      const end = r.end === null ? null : toIso(r.end);

      const first = section.first;
      // r.start は壁時計(JST)をUTCとみなしたms。比較相手も同じ尺度にする(Date.parse(ISO+09:00)は実エポックで9時間ずれる)
      const wallOf = (iso: string): number => Date.parse(`${iso.slice(0, 16)}:00Z`);
      if (first?.end != null && r.start >= wallOf(first.start) && r.start <= wallOf(first.end)) {
        (first.slots ??= []).push({ start, end });
        continue;
      }
      if (events.length === 0 && name !== null && !isAnnouncement(name)) titleHeading = name;
      const ev: PeriodEvent = {
        id: `${input.id}#${events.length}`,
        name: (section.label === RAID_LABEL ? raidName(input.title) : isMaintenanceLabel(section.label) ? maintenanceName(input.title) : null) ?? name ?? `${input.title} #${events.length + 1}`,
        label: section.label,
        start,
        end,
        raw: r.raw,
        ...(name === null || name === titleHeading ? { title_named: true as const } : {}),
        ...(name !== null && input.anchors?.[name] ? { anchor: input.anchors[name] } : {}),
      };
      events.push(ev);
      section.first ??= ev;
    }
  }

  // 期間を持たない告知項目は記事の主期間(events[0])を継承する(既存eventのidは変えないよう末尾に追加)
  // 降臨(初出現日時)は短い期間なので継承元にしない
  const main = events.find((e) => e.label !== RAID_LABEL);
  if (main) {
    const known = new Set(events.map((e) => e.name));
    for (const h of headings) {
      if (h.hasEvent || h.hasOtherDate || !isAnnouncement(h.name) || known.has(h.name)) continue;
      known.add(h.name);
      events.push({ id: `${input.id}#${events.length}`, name: h.name, label: main.label, start: main.start, end: main.end, raw: main.raw, inherited: true, ...(input.anchors?.[h.name] ? { anchor: input.anchors[h.name] } : {}) });
    }
  }

  // ガチャの日替わりピックアップ(Vol.1〜): Vol ごとに1イベント。Vol が全体期間を覆うなら全体期間の行は作らない
  const brand = /ガチャ「([^」]+)」/.exec(input.title)?.[1];
  const vols = brand ? volBlocks(input.lines, input.published, warnings) : [];
  if (brand && vols.length > 0) {
    const first = Math.min(...vols.map((v) => v.start));
    const last = vols.some((v) => v.end === null) ? null : Math.max(...vols.map((v) => v.end as number));
    // 全体期間を表す行(記事タイトル由来 or ガチャ名の行)だけを置き換える。同じ期間の別項目や継承の写しは残す
    const wholeGacha = (e: PeriodEvent): boolean => !e.inherited && (e.title_named === true || e.name.includes(`ガチャ「${brand}`));
    const covers = (e: PeriodEvent): boolean => wholeGacha(e) && e.start === toIso(first) && last !== null && e.end === toIso(last);
    for (let i = events.length - 1; i >= 0; i--) if (covers(events[i] as PeriodEvent)) events.splice(i, 1);
    let next = events.reduce((m, e) => Math.max(m, (Number(e.id.split('#')[1]) || 0) + 1), 0);
    for (const v of vols) {
      events.push({
        id: `${input.id}#${next++}`,
        name: `ガチャ「${normalizeText(brand)} Vol.${v.n}」`,
        label: '日替わりピックアップ',
        start: toIso(v.start),
        end: v.end === null ? null : toIso(v.end),
        raw: v.raw,
        ...(v.chars.length > 0 ? { details: [{ label: '対象キャラ', lines: v.chars }] } : {}),
      });
    }
  }

  // 全体期間の行を置き換えたときは、ステージ等のブロックの付け先(主期間)も取り直す
  attachDetails(input.lines, events, events.find((e) => e.label !== RAID_LABEL));
  addBatchBlock(input, events, events.find((e) => e.label !== RAID_LABEL), warnings);
  addCharaColors(input, events);
  addPickups(input, events, warnings);
  addBossColors(input, events);

  const hasOk = events.some((e) => e.end !== null);
  const status: ParseStatus = hasOk ? 'ok' : events.length > 0 || rewardUntil !== null ? 'partial' : 'none';
  return {
    parse_status: status,
    events,
    reward_until: rewardUntil === null ? null : toIso(rewardUntil),
    warnings,
  };
}

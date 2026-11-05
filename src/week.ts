// 週表示の純ロジック（DOMなし）。spec §4.3。日付はゲーム日 YYYY-MM-DD(JST)。
import { gameDayOf, isOnGameDay } from './gameday';
import { GACHA_GROUPS, GACHA_GROUP_ORDER, QUEST_GROUP_ORDER, gachaEra, gachaGroup, regularGachaIndex, CAMPAIGN_ALIASES, CAMPAIGN_GROUPS, ROW_RULES, MAINTENANCE_CATEGORY, EVENT_QUEST_SUFFIX, QUEST_GROUPS, QUEST_ORDER, SECTIONS, sectionOf, sectionOfEvent, type Section } from './sections';
import type { ExportEvent } from './data/export';
import { labelLines, shortLabel, superUltimateLabel, superUltimateParts } from './label';
import { labelOverride } from './label-override';
import { MONTHLY } from './monthly';
import type { DetailBlock } from './details';
import type { Slot } from './period';
import { JST_OFFSET_MS, WEEKDAYS } from './jst';

const DAY = 86_400_000;

/** ゲーム日に n 日足す。 */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** 起点から連続する7日。 */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** `YYYY-MM` の全日(1日〜末日)。 */
export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const next = addMonths(month, 1);
  const n = Math.round((Date.parse(`${next}-01T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY);
  return Array.from({ length: n }, (_, i) => addDays(first, i));
}

/** `YYYY-MM` に n か月足す。 */
export function addMonths(month: string, n: number): string {
  const t = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** 日付(YYYY-MM-DD)に n か月足す。存在しない日(1/31+1か月など)は月末日。 */
export function addMonthsToDay(day: string, n: number): string {
  const m = addMonths(day.slice(0, 7), n);
  const last = monthDays(m).length;
  return `${m}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, '0')}`;
}

/** 月表示の窓: 起点の日から「同じ日の翌月」の前日まで(2026-10-27 → 10/27〜11/26の31日)。 */
export function monthWindow(start: string): string[] {
  const n = Math.round((Date.parse(`${addMonthsToDay(start, 1)}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

export function weekdayOf(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()] as string;
}

/** `10/27(火)` */
export function dayLabel(day: string): string {
  return `${day.slice(5, 7)}/${day.slice(8, 10)}(${weekdayOf(day)})`;
}

/** 瞬間(ISO) → JST の `M/D(曜) HH:mm`（ブラウザのTZに依存しない）。 */
export function formatJst(iso: string): string {
  const jst = new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString();
  return `${dayLabel(jst.slice(0, 10))} ${jst.slice(11, 16)}`;
}

/** 複数月ファイルのeventを id で重複排除して結合。 */
export function mergeEvents(lists: ExportEvent[][]): ExportEvent[] {
  const map = new Map<string, ExportEvent>();
  for (const e of lists.flat()) map.set(e.id, e);
  return [...map.values()];
}

export interface DayEntry {
  event: ExportEvent;
  /** 開始日以外の日（複数日の継続） */
  continued: boolean;
  /** 終了未定 (end=null) */
  openEnded: boolean;
}

/** その日に表示するイベント。開始時刻順。除外カテゴリは出さない。 */
export function eventsForDay(events: ExportEvent[], day: string): DayEntry[] {
  return events
    .filter((e) => sectionOf(e.category) !== null && isOnGameDay(e, day))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id))
    .map((event) => ({ event, continued: gameDayOf(new Date(event.start)) !== day, openEnded: event.end === null }));
}

/** 日別枠 → 日付(JST暦日)ごとの時間帯。例: `8:00〜9:00` `12:00〜13:00`。日付をまたぐ枠は終了に日付を付ける。 */
export function slotRows(slots: readonly Slot[]): { date: string; times: string[] }[] {
  const jst = (iso: string): string => new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString();
  const hm = (iso: string): string => jst(iso).slice(11, 16);
  const rows = new Map<string, string[]>();
  for (const s of slots) {
    const day = jst(s.start).slice(0, 10);
    const sameDay = s.end !== null && jst(s.end).slice(0, 10) === day;
    const t = s.end === null ? `${hm(s.start)}〜` : sameDay ? `${hm(s.start)}〜${hm(s.end)}` : `${hm(s.start)}〜${dayLabel(jst(s.end).slice(0, 10))} ${hm(s.end)}`;
    rows.set(day, [...(rows.get(day) ?? []), t]);
  }
  return [...rows].map(([day, times]) => ({ date: dayLabel(day), times }));
}

/** 期間表示。 */
export function periodText(e: { start: string; end: string | null }): string {
  return e.end === null ? `${formatJst(e.start)} 〜 終了未定` : `${formatJst(e.start)} 〜 ${formatJst(e.end)}`;
}

export interface BarSpan {
  event: ExportEvent;
  /** 表示日内の開始/終了の列(0始まり, 両端含む。列=暦日) */
  from: number;
  to: number;
  /** 週の左端/右端で切れている */
  clippedLeft: boolean;
  clippedRight: boolean;
  openEnded: boolean;
  /** 開始列(from)内の開始位置 0〜1(暦の0:00=0, 12:00=0.5)。左が切れていれば 0 */
  startFrac: number;
  /** 終了列(to)内の終了位置 0〜1。右が切れている/終了未定なら 1 */
  endFrac: number;
}

/** 暦日(JST 0:00〜24:00)の開始ms。バーの位置は列=暦日として時刻の割合で決める(12:00=列の半分)。 */
function calStart(day: string): number {
  return Date.parse(`${day}T00:00:00+09:00`);
}

/** イベントが days 内で占める列。期間外ならnull。列は暦日(JST)、開始/終了は列内の時刻の割合。 */
export function barSpan(event: ExportEvent, days: string[]): BarSpan | null {
  const startMs = Date.parse(event.start);
  const endMs = event.end === null ? null : Date.parse(event.end);
  const rangeFrom = calStart(days[0] as string);
  const rangeTo = calStart(days[days.length - 1] as string) + DAY;
  if (startMs >= rangeTo || (endMs !== null ? endMs <= rangeFrom : startMs < rangeFrom)) return null;
  const colOf = (ms: number): number => Math.min(days.length - 1, Math.max(0, Math.floor((ms - rangeFrom) / DAY)));
  const from = colOf(startMs);
  // 終了が丁度0:00なら前日の列まで。終了未定は開始の列のみ
  const to = endMs === null ? from : colOf(Math.max(startMs, endMs - 1));
  const clippedLeft = startMs < rangeFrom;
  const clippedRight = endMs !== null && endMs > rangeTo;
  return {
    event,
    from,
    to,
    clippedLeft,
    clippedRight,
    openEnded: endMs === null,
    startFrac: clippedLeft ? 0 : (startMs - calStart(days[from] as string)) / DAY,
    endFrac: endMs === null || clippedRight ? 1 : Math.min(1, (endMs - calStart(days[to] as string)) / DAY),
  };
}

/** 同じ見出しのブロックは項目を和集合(重複除去・順序維持)にして1つにする。 */
function mergeDetails(a: DetailBlock[] | undefined, b: DetailBlock[] | undefined): DetailBlock[] | undefined {
  const out: DetailBlock[] = [];
  for (const blk of [...(a ?? []), ...(b ?? [])]) {
    const same = out.find((x) => x.label === blk.label);
    if (same) same.lines = [...new Set([...same.lines, ...blk.lines])];
    else out.push({ label: blk.label, lines: [...blk.lines] });
  }
  return out.length > 0 ? out : undefined;
}

/** 日別枠は和集合(開始順・重複除去)。 */
function mergeSlots(a: Slot[] | undefined, b: Slot[] | undefined): Slot[] | undefined {
  const all = [...(a ?? []), ...(b ?? [])];
  const uniq = [...new Map(all.map((x) => [`${x.start}|${x.end}`, x])).values()].sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  return uniq.length > 0 ? uniq : undefined;
}

/**
 * 同一セクション・同一表示ラベル(shortLabel)で期間が重なる(端が接する/同時刻を含む)イベントを1件に統合する。
 * 期間は和集合(最も早い開始〜最も遅い終了。どちらかが終了未定なら未定)。離れた期間は別のまま。spec §4.3.2。
 * 代表は開始が最も早いイベント(id・名前・URL)。冪等。
 */
/** 同じ行にまとめるキー。通常は短縮ラベル。ピックアップは短縮(24字で切れる)で別ピックアップと衝突しないよう全名。 */
const rowKey = (e: ExportEvent): string => (e.pickup ? e.name : shortLabel(e.name));

export function mergeSameLabel(events: ExportEvent[]): ExportEvent[] {
  const groups = new Map<string, ExportEvent[]>();
  const out: ExportEvent[] = [];
  for (const e of events) {
    const sec = sectionOfEvent(e);
    if (!sec) {
      out.push(e); // 除外カテゴリは統合せずそのまま通す
      continue;
    }
    const k = `${sec.id}\u0000${rowKey(e)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const endMs = (e: { end: string | null }): number => (e.end === null ? Infinity : Date.parse(e.end));
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
    let cur: ExportEvent | undefined;
    for (const e of sorted) {
      if (cur && Date.parse(e.start) <= endMs(cur)) {
        const end: string | null = cur.end === null || e.end === null ? null : endMs(e) > endMs(cur) ? e.end : cur.end;
        const ru: string | null = [cur.reward_until, e.reward_until].filter((x): x is string => x !== null).sort((x, y) => Date.parse(x) - Date.parse(y)).pop() ?? null;
        const details = mergeDetails(cur.details, e.details);
        const slots = mergeSlots(cur.slots, e.slots);
        cur = { ...cur, end, reward_until: ru, ...(details ? { details } : {}), ...(slots ? { slots } : {}) };
      } else {
        if (cur) out.push(cur);
        cur = e;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** 降臨スケジュールの名称(`黎絶 キャローネ降臨`)。 */
const RAID_NAME = /^(轟絶|黎絶|滅絶) .+降臨$/;

/** クエストの小見出し(QUEST_GROUPS のいずれか)。spec §4.3.5。 */
export function questGroup(e: { name: string; id?: string; group?: string }): string {
  if (e.group !== undefined && QUEST_GROUPS.includes(e.group)) return e.group;
  if (e.id?.endsWith(EVENT_QUEST_SUFFIX)) return QUEST_GROUPS[1] as string;
  if (QUEST_ORDER.some((k) => e.name.includes(k))) return QUEST_GROUPS[0] as string;
  if (RAID_NAME.test(e.name)) return '絶級クエスト';
  if (e.name.includes('超究極')) return '超究極クエスト';
  if (e.name.includes('クエスト')) return '期間限定クエスト';
  return 'その他';
}

/** 名前順(かな→漢字。漢字はJIS順相当で、訓読みの読み順にはならない。数字は数値順)。 */
const byName = new Intl.Collator('ja', { numeric: true }).compare;

export interface RowLabel {
  l1: string;
  l2: string | null;
  /** 1行目を折り返して2行使う(小見出し配下の説明・超究極のキャラ名) */
  wrap: boolean;
}

/** 行ラベルの表示内容(ui と並び順の「名前」で共用)。キャンペーンの小見出し配下は説明のみ、超究極はキャラ名（補足）。 */
export function rowLabel(sectionId: string, e: { name: string; pickup?: { name: string } }): RowLabel {
  // クエスト・キャンペーンの長いラベルの上書き(config/display/label-overrides.json)。1行(折り返さない)。ガチャには適用しない
  if (sectionId !== 'gacha') {
    const o = labelOverride(e.name);
    if (o) return { l1: o.l1, l2: o.l2, wrap: false };
  }
  const lines = labelLines(e.name);
  const chara = sectionId === 'quest' && questGroup(e) === '超究極クエスト' ? superUltimateLabel(e.name) : null;
  if (chara) return { l1: chara, l2: null, wrap: true };
  // コラボガチャのピックアップ: 通常ガチャの行の直下に、ピックアップ名だけを出す(インデントと点はCSS。作品名は上の行・ツールチップ)
  if (sectionId === 'gacha' && e.pickup) return { l1: e.pickup.name, l2: null, wrap: true };
  const gacha = sectionId === 'gacha' ? /ガチャ「([^」]+)」/.exec(e.name)?.[1] : undefined;
  if (gacha) return { l1: gacha, l2: null, wrap: true };
  if (sectionId === 'quest' && RAID_NAME.test(e.name)) return { l1: e.name.replace(/降臨$/, ''), l2: null, wrap: false };
  if (sectionId === 'campaign' && campaignGroup(e) !== null && lines.desc) return { l1: lines.desc, l2: null, wrap: true };
  return { l1: lines.title, l2: lines.desc, wrap: false };
}

/** 表示ラベルでの名前順の比較(1行目→2行目)。 */
const byLabel = (sectionId: string, a: ExportEvent, b: ExportEvent): number => {
  const la = rowLabel(sectionId, a);
  const lb = rowLabel(sectionId, b);
  return byName(la.l1, lb.l1) || byName(la.l2 ?? '', lb.l2 ?? '');
};

/** 小見出し内の並び(order.json の rows)。fixed=語の順 → 同順位は then(既定 name=名前順 / start=0 で開始順に任せる)。name=名前順。start・設定なし=0(開始順に任せる)。 */
function groupSortCmp(group: string, sectionId: string, a: ExportEvent, b: ExportEvent): number {
  const rule = ROW_RULES[group];
  if (!rule || rule.sort === 'start' || rule.sort === 'builtin') return 0;
  if (rule.sort === 'name') return byLabel(sectionId, a, b);
  const spec = rule.words ?? [];
  const star = spec.indexOf('*');
  const rank = (e: ExportEvent): number => {
    const i = spec.findIndex((k) => k !== '*' && e.name.includes(k));
    return i >= 0 ? i : star >= 0 ? star : spec.length;
  };
  return rank(a) - rank(b) || (rule.then === 'start' ? 0 : byLabel(sectionId, a, b));
}

/** クエストの並び: 小見出し順 → イベントは 通常→コラボ(各々開始順) / 定例は QUEST_ORDER の順 / 絶級は 滅絶→黎絶→轟絶→名前 / 超究極は 補足なし→補足(名前)→キャラ名 / 期間限定は名前。 */
function questCmp(a: ExportEvent, b: ExportEvent): number {
  const ga = questGroup(a);
  const gb = questGroup(b);
  if (ga !== gb) return QUEST_GROUP_ORDER.indexOf(ga) - QUEST_GROUP_ORDER.indexOf(gb);
  if (ga === QUEST_GROUPS[1]) return Number(a.category === 'collab') - Number(b.category === 'collab');
  if (ga === '超究極クエスト') {
    const pa = superUltimateParts(a.name) ?? { chara: '', kind: '' };
    const pb = superUltimateParts(b.name) ?? { chara: '', kind: '' };
    // 補足なしが先。補足ありは補足の名前順、同じ補足内はキャラ名順
    return Number(pa.kind !== '') - Number(pb.kind !== '') || byName(pa.kind, pb.kind) || byName(pa.chara, pb.chara);
  }
  return groupSortCmp(ga, 'quest', a, b);
}

/** ガチャの並び: 小見出し順 → 定例は GACHA_REGULAR の順 / イベントは 通常→コラボ(各々開始順) / 期間限定は名前順。 */
/** 作品名(`ガチャ「作品」…` / `ガチャ「作品｜ピックアップ」`)。通常ガチャとそのピックアップを同じ作品としてまとめるキー。 */
const workOf = (e: ExportEvent): string => /^ガチャ「([^」｜]+)/.exec(e.name)?.[1] ?? e.name;

/** 作品ごとの開始(通常ガチャの開始。無ければピックアップの最初)。同ラベル統合で通常ガチャの開始が変わっても、作品の塊が崩れない。 */
function workStarts(events: ExportEvent[]): Map<string, number> {
  const mains = new Map<string, number>();
  const picks = new Map<string, number>();
  for (const e of events) {
    const m = e.pickup ? picks : mains;
    const k = workOf(e);
    const t = Date.parse(e.start);
    if (!m.has(k) || t < (m.get(k) as number)) m.set(k, t);
  }
  return new Map([...picks, ...mains]);
}

function gachaCmp(a: ExportEvent, b: ExportEvent, works: Map<string, number>): number {
  const ga = gachaGroup(a) ?? '';
  const gb = gachaGroup(b) ?? '';
  if (ga !== gb) return GACHA_GROUP_ORDER.indexOf(ga) - GACHA_GROUP_ORDER.indexOf(gb);
  if (ga === GACHA_GROUPS[1]) {
    // 作品ごとにまとめる: 通常ガチャの行(開始順)の直後に、そのピックアップ(表の登場順)を連続させる
    const start = (e: ExportEvent): number => works.get(workOf(e)) ?? Date.parse(e.start);
    const rank = (e: ExportEvent): number => (e.pickup ? e.pickup.order + 1 : 0);
    return Number(a.category === 'collab') - Number(b.category === 'collab') || start(a) - start(b) || workOf(a).localeCompare(workOf(b)) || rank(a) - rank(b);
  }
  if (ga !== GACHA_GROUPS[0] || ROW_RULES[ga]?.sort !== 'fixed') return groupSortCmp(ga, 'gacha', a, b);
  return regularGachaIndex(a.name) - regularGachaIndex(b.name) || gachaEra(a.name) - gachaEra(b.name);
}

/** キャンペーンの並び順(CAMPAIGN_GROUPSの上から。一致しないものは末尾=その他)。spec §4.3.3。 */
export function campaignRank(e: ExportEvent, order: readonly string[] = CAMPAIGN_GROUPS): number {
  const g = campaignGroup(e, order);
  return g === null ? order.length : order.indexOf(g);
}

/** キャンペーンの小見出し(一致したグループ語)。一致しなければ null。 */
export function campaignGroup(e: { name: string; group?: string }, order: readonly string[] = CAMPAIGN_GROUPS): string | null {
  if (e.group !== undefined && order.includes(e.group)) return e.group;
  const direct = order.find((k) => e.name.includes(k));
  if (direct) return direct;
  const alias = Object.keys(CAMPAIGN_ALIASES).find((k) => e.name.includes(k));
  const g = alias === undefined ? undefined : CAMPAIGN_ALIASES[alias];
  return g !== undefined && order.includes(g) ? g : null;
}

/** 月次項目の pin(config/schedule/monthly-days.json): top=先頭、after=指定語を含む行の直下。対象が無い/行が見つからなければそのまま。 */
function applyPins(rows: BarSpan[][]): BarSpan[][] {
  const pinOf = (r: BarSpan[]) => MONTHLY.find((m) => m.name === (r[0] as BarSpan).event.name)?.pin;
  const out = rows.filter((r) => !pinOf(r)?.top && !pinOf(r)?.after);
  const tops = rows.filter((r) => pinOf(r)?.top);
  for (const r of rows.filter((x) => pinOf(x)?.after)) {
    const key = pinOf(r)?.after as string;
    let i = -1;
    out.forEach((o, k) => {
      if (o.some((b) => b.event.name.includes(key))) i = k;
    });
    if (i < 0) {
      // 対象行が無いときは、同じキャンペーングループの最後の行の直下(グループが分断されない)。無ければ末尾
      const g = campaignGroup((r[0] as BarSpan).event);
      out.forEach((o, k) => {
        if (g !== null && campaignGroup((o[0] as BarSpan).event) === g) i = k;
      });
    }
    out.splice(i < 0 ? out.length : i + 1, 0, r);
  }
  return [...tops, ...out];
}

/** メンテナンスの帯(行ではなく全体を貫く)。表示日と重なるものを開始順で返す。 */
export function maintenanceBars(events: ExportEvent[], days: string[]): BarSpan[] {
  return events
    .filter((e) => e.category === MAINTENANCE_CATEGORY)
    .map((e) => barSpan(e, days))
    .filter((b): b is BarSpan => b !== null)
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start) || a.event.id.localeCompare(b.event.id));
}

/** メンテナンスがその暦日(JST 0:00〜24:00)にかかるか。詳細パネルの日付選択で使う。 */
export function maintenanceOnDay(e: ExportEvent, day: string): boolean {
  const from = calStart(day);
  return e.category === MAINTENANCE_CATEGORY && Date.parse(e.start) < from + DAY && (e.end === null ? Date.parse(e.start) >= from : Date.parse(e.end) > from);
}

export interface GanttSection {
  section: Section;
  bars: BarSpan[];
  /** 同じ表示ラベルのバーを1行にまとめたもの(期間は重ならない前提)。行順は bars の初出順 */
  rows: BarSpan[][];
}

/** セクションごとの行。セクション設定順、行内は開始順。除外カテゴリ/空セクションは出さない。 */
export function ganttSections(events: ExportEvent[], days: string[]): GanttSection[] {
  const map = new Map<string, GanttSection>();
  for (const e of mergeSameLabel(events)) {
    const section = sectionOfEvent(e);
    const bar = barSpan(e, days);
    if (!section || !bar) continue;
    const g = map.get(section.id) ?? { section, bars: [], rows: [] };
    g.bars.push(bar);
    map.set(section.id, g);
    // イベントガチャ(コラボ含む)は同じラベル・期間でクエストの「イベントクエスト」にも写す
    if (section.id === 'gacha' && gachaGroup(e) === GACHA_GROUPS[1] && !e.pickup) {
      const quest = SECTIONS.find((x) => x.id === 'quest');
      const copy = { ...e, id: `${e.id}${EVENT_QUEST_SUFFIX}`, name: rowLabel('gacha', e).l1 };
      const cbar = barSpan(copy, days);
      if (quest && cbar) {
        const q = map.get(quest.id) ?? { section: quest, bars: [], rows: [] };
        q.bars.push(cbar);
        map.set(quest.id, q);
      }
    }
  }
  const order = SECTIONS.map((s) => s.id);
  return [...map.values()]
    .sort((a, b) => order.indexOf(a.section.id) - order.indexOf(b.section.id))
    .map((g) => {
      const works = workStarts(g.bars.map((b) => b.event));
      const bars = g.bars.sort(
        (a, b) =>
          (g.section.id === 'quest' ? questCmp(a.event, b.event) : 0) ||
          (g.section.id === 'gacha' ? gachaCmp(a.event, b.event, works) : 0) ||
          (g.section.id === 'campaign'
            ? campaignRank(a.event) - campaignRank(b.event) || groupSortCmp(campaignGroup(a.event) ?? '', 'campaign', a.event, b.event)
            : 0) ||
          Date.parse(a.event.start) - Date.parse(b.event.start) ||
          a.event.id.localeCompare(b.event.id),
      );
      const sameLabel = new Map<string, BarSpan[]>();
      for (const b of bars) sameLabel.set(rowKey(b.event), [...(sameLabel.get(rowKey(b.event)) ?? []), b]);
      return { ...g, bars, rows: applyPins([...sameLabel.values()]) };
    });
}

// 収集前後の差分レポート(DOMなし・純関数)。更新PRで『今回の変更分』だけを見られるようにする。
// 新規・変更の項目、公開サイトで増える/消える項目、新規の要判断、設定の要対応(新クエスト・長いラベル・期間が取れない記事)を算出する。
import type { Rule } from './classify';
import { buildExport, type ExportEvent } from './data/export';
import type { ArticleRecord } from './data/record';
import { judgeAll, reviewGroups, selectedKeys, type Decisions, type ReviewGroup } from './decisions';
import { checkHakai, type HakaiUnknown } from './hakai-check';
import { labelWidth, MAX_LABEL_WIDTH } from './label-override';
import { applySelection, buildCandidates } from './selection';
import { MAINTENANCE_CATEGORY, sectionOfEvent } from './sections';
import { mergeEvents, periodText, rowLabel } from './week';

/** レポートの1項目。 */
export interface ReportEvent {
  id: string;
  /** 項目名(記事の見出し・タイトル由来) */
  name: string;
  /** カレンダーの行ラベル(1行目) */
  label: string;
  category: string;
  start: string;
  end: string | null;
  /** 公式記事のURL(項目のアンカー付き) */
  url: string;
  /** 自動の判定: on=表示 / off=非表示 / review=要判断(未判断は非表示) */
  judgment: 'on' | 'off' | 'review';
  /** 判定の根拠: ルール名 / '記憶'(人の判断の記憶) / '常に表示'(メンテナンス)。要判断なら null */
  rule: string | null;
}

export interface LongLabel {
  id: string;
  label: string;
  width: number;
}

export interface UpdateReport {
  newArticles: number;
  changedArticles: number;
  /** 今回初めて見つかった項目(期間が取れたもの) */
  newEvents: ReportEvent[];
  /** 期間・名前が変わった既存の項目 */
  changedEvents: { before: ReportEvent; after: ReportEvent }[];
  /** 公開サイトで新しく見える/見えなくなる項目(判断・表示範囲の絞り込み前の、カレンダー表示ベース) */
  visibleAdded: ReportEvent[];
  visibleRemoved: ReportEvent[];
  /** 新規の要判断(前回に無かった候補の種類ごと) */
  pending: ReviewGroup[];
  /** 前回からある未判断(非表示のまま)の候補数 */
  carriedPending: number;
  /** 設定の要対応 */
  newQuests: HakaiUnknown[];
  longLabels: LongLabel[];
  /** 期間が取れなかった新規の記事 */
  unparsed: { id: string; title: string; url: string }[];
}

export interface ReportInput {
  prev: readonly ArticleRecord[];
  cur: readonly ArticleRecord[];
  decisions: Decisions;
  rules: Rule[] | null;
}

interface View {
  events: Map<string, ReportEvent>;
  /** 公開サイトに出る(カレンダーに表示される)項目のid */
  visible: Set<string>;
  keys: Set<string>;
  judged: ReturnType<typeof judgeAll>;
  exported: Map<string, ExportEvent>;
}

/** レコード集合 → 項目・判定・表示される項目。 */
function view(records: readonly ArticleRecord[], decisions: Decisions, rules: Rule[] | null): View {
  const recs = [...records];
  const cands = buildCandidates(recs);
  const judged = judgeAll(cands, decisions, rules);
  const byKey = new Map(judged.map((j) => [j.cand.key, j]));
  const { months } = buildExport(recs, '');
  const all = mergeEvents(months.map((m) => m.events));
  const exported = new Map(all.map((e) => [e.id, e]));
  const shown = applySelection(all, { generated_at: '', selected: selectedKeys(judged), total: cands.length });
  const events = new Map<string, ReportEvent>();
  for (const e of all) {
    const j = e.item === undefined ? undefined : byKey.get(e.item);
    const maint = e.category === MAINTENANCE_CATEGORY; // メンテナンスは判断の対象外で常に表示
    const judgment: ReportEvent['judgment'] = maint || j?.decision === 'on' ? 'on' : j?.decision === 'off' ? 'off' : 'review';
    events.set(e.id, {
      id: e.id,
      name: e.name,
      label: sectionOfEvent(e) ? rowLabel(sectionOfEvent(e)?.id ?? '', e).l1 : e.name,
      category: e.category,
      start: e.start,
      end: e.end,
      url: e.url,
      judgment,
      rule: maint ? '常に表示' : j?.decision == null ? null : j.source === 'memory' ? '記憶' : (j.rule ?? null),
    });
  }
  return { events, visible: new Set(shown.map((e) => e.id)), keys: new Set(cands.map((c) => c.key)), judged, exported };
}

const recordOf = (recs: readonly ArticleRecord[]): Map<string, ArticleRecord> => new Map(recs.map((r) => [r.id, r]));

/** 収集前後の差分を算出する。 */
export function buildUpdateReport({ prev, cur, decisions, rules }: ReportInput): UpdateReport {
  const before = view(prev, decisions, rules);
  const after = view(cur, decisions, rules);
  const prevRecs = recordOf(prev);

  const newIds: string[] = [];
  let changedArticles = 0;
  for (const r of cur) {
    const p = prevRecs.get(r.id);
    if (!p) newIds.push(r.id);
    else if (p.content_hash !== r.content_hash || JSON.stringify(p.events) !== JSON.stringify(r.events)) changedArticles++;
  }

  const newEvents: ReportEvent[] = [];
  const changedEvents: UpdateReport['changedEvents'] = [];
  for (const [id, e] of after.events) {
    const b = before.events.get(id);
    if (!b) newEvents.push(e);
    else if (b.start !== e.start || b.end !== e.end || b.name !== e.name) changedEvents.push({ before: b, after: e });
  }
  const byStart = (a: ReportEvent, b: ReportEvent): number => a.start.localeCompare(b.start) || a.id.localeCompare(b.id);
  newEvents.sort(byStart);

  const visibleAdded = [...after.visible].filter((id) => !before.visible.has(id)).map((id) => after.events.get(id) as ReportEvent).sort(byStart);
  const visibleRemoved = [...before.visible].filter((id) => !after.visible.has(id)).map((id) => before.events.get(id) as ReportEvent).sort(byStart);

  const freshJudged = after.judged.filter((j) => !before.keys.has(j.cand.key));
  const pending = reviewGroups(freshJudged);
  const carriedPending = after.judged.filter((j) => j.bucket === 'review' && before.keys.has(j.cand.key)).length;

  const prevQuests = new Set(checkHakai(prev).unknown.map((u) => u.name));
  const newQuests = checkHakai(cur).unknown.filter((u) => !prevQuests.has(u.name));

  const longLabels: LongLabel[] = [];
  for (const e of [...visibleAdded, ...changedEvents.filter((c) => after.visible.has(c.after.id)).map((c) => c.after)]) {
    const x = after.exported.get(e.id);
    const sec = x ? sectionOfEvent(x)?.id : undefined;
    if (!x || !sec || sec === 'gacha') continue; // ガチャの行ラベルは変形しない方針
    const label = rowLabel(sec, x);
    const width = labelWidth(label.l1);
    if (width > MAX_LABEL_WIDTH && !longLabels.some((l) => l.label === label.l1)) longLabels.push({ id: e.id, label: label.l1, width });
  }

  const unparsed = newIds
    .map((id) => cur.find((r) => r.id === id) as ArticleRecord)
    .filter((r) => r.parse_status === 'none')
    .map((r) => ({ id: r.id, title: r.title, url: r.url }));

  return { newArticles: newIds.length, changedArticles, newEvents, changedEvents, visibleAdded, visibleRemoved, pending, carriedPending, newQuests, longLabels, unparsed };
}

/** 要対応(人が見る必要がある)があるか。 */
export const needsAttention = (r: UpdateReport): boolean => r.pending.length > 0 || r.newQuests.length > 0 || r.longLabels.length > 0 || r.unparsed.length > 0;

const MAX_ROWS = 60;
const day = (iso: string): string => iso.slice(0, 10);
const esc = (s: string): string => s.replace(/\|/g, '｜').replace(/\n/g, ' ');
const JUDGE: Record<ReportEvent['judgment'], string> = { on: '表示', off: '非表示', review: '要判断(非表示)' };

function eventTable(rows: ReportEvent[]): string[] {
  const shown = rows.slice(0, MAX_ROWS);
  const out = ['| 開始 | 項目 | 期間 | 判定 |', '|---|---|---|---|'];
  for (const e of shown) out.push(`| ${day(e.start)} | [${esc(e.label)}](${e.url}) | ${esc(periodText(e))} | ${JUDGE[e.judgment]}${e.rule ? `(${e.rule})` : ''} |`);
  if (rows.length > shown.length) out.push('', `ほか ${rows.length - shown.length} 件`);
  return out;
}

/** PR本文用のMarkdown。公式の本文は含めず、項目名・期間・リンクのみ。 */
export function renderUpdateReport(r: UpdateReport, meta: { generatedAt: string }): string {
  const L: string[] = [];
  L.push(`## 更新レポート (${meta.generatedAt})`, '');
  L.push(`- 新規の記事 ${r.newArticles} 件 / 内容が変わった記事 ${r.changedArticles} 件`);
  L.push(`- 新規の項目 ${r.newEvents.length} 件 / 変更された項目 ${r.changedEvents.length} 件`);
  L.push(`- 公開サイトに新しく出る項目 ${r.visibleAdded.length} 件 / 見えなくなる項目 ${r.visibleRemoved.length} 件`);
  L.push(`- 要対応: 新規の要判断 ${r.pending.length} 種類 / 新しい星墓クエスト ${r.newQuests.length} 件 / 1行に収まらないラベル ${r.longLabels.length} 件 / 期間が取れない新規の記事 ${r.unparsed.length} 件`);
  if (r.carriedPending > 0) L.push(`- 前回からの未判断(非表示のまま) ${r.carriedPending} 件`);
  L.push('');

  if (r.visibleAdded.length > 0) L.push('### 公開サイトに新しく出る項目', '', ...eventTable(r.visibleAdded), '');
  if (r.visibleRemoved.length > 0) L.push('### 公開サイトから見えなくなる項目', '', ...eventTable(r.visibleRemoved), '');
  if (r.newEvents.length > 0) L.push('<details><summary>新規の項目(すべて。判定つき)</summary>', '', ...eventTable(r.newEvents), '', '</details>', '');
  if (r.changedEvents.length > 0) {
    L.push('### 変更された項目', '', '| 項目 | 変更前 | 変更後 |', '|---|---|---|');
    for (const c of r.changedEvents.slice(0, MAX_ROWS)) L.push(`| [${esc(c.after.label)}](${c.after.url}) | ${esc(periodText(c.before))} | ${esc(periodText(c.after))} |`);
    if (r.changedEvents.length > MAX_ROWS) L.push('', `ほか ${r.changedEvents.length - MAX_ROWS} 件`);
    L.push('');
  }

  const todo: string[] = [];
  for (const g of r.pending) todo.push(`- 要判断: ${esc(g.examples[0] ?? g.id)} (${g.category} / 同種${g.count}件) ${g.url}`);
  for (const q of r.newQuests) todo.push(`- 新しい星墓クエスト: 「${q.name}」(記事 ${q.article}、開催 ${q.start}) → \`config/schedule/hakai.json\` の quests に追加`);
  for (const l of r.longLabels) todo.push(`- 1行に収まらないラベル: 「${l.label}」(約${l.width.toFixed(1)}文字) → \`config/display/label-overrides.json\` に短い表記を追加`);
  for (const u of r.unparsed) todo.push(`- 期間が取れない記事: [${esc(u.title)}](${u.url})`);
  L.push('### 要対応', '', todo.length > 0 ? todo.join('\n') : '要対応はありません。', '');
  return L.join('\n');
}

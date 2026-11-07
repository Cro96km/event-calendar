// 台帳: 収集した項目(記事・期間・内容)を、表示/非表示の判定つきで月別の表にする純関数。spec §4.10。
// 表示する項目は画面と同じ順(セクション→小見出し→行)、非表示・要判断の項目は各セクションの末尾。誤りを見つけたときに項目IDを引けるようにする。生成物なので手で編集しない。
import { type ExportEvent } from './data/export';
import { normalQuestBlock, type DetailBlock } from './details';
import { MONTHLY, monthlyEvents } from './monthly';
import { EVENT_QUEST_SUFFIX, MAINTENANCE_CATEGORY, SECTIONS, gachaGroup, sectionOfEvent } from './sections';
import { newLimitedHosts } from './newlimited';
import { addMonths, windowRange } from './window';
import { JST_OFFSET_MS } from './jst';
import { barSpan, campaignGroup, ganttSections, monthDays, questGroup, rowKey, rowLabel } from './week';

export const LEDGER_MARK = '<!-- generated: npm run ledger -->';

const esc = (t: string): string => t.replace(/\|/g, '｜').replace(/\n/g, ' ');

/** 内容の列: ブロックごとに `見出し: 行 / 行`。長いものは先頭だけ(全文は公式記事)。 */
function contentOf(e: ExportEvent): string {
  const derived = normalQuestBlock(e);
  const blocks: DetailBlock[] = [...(e.details ?? []), ...(derived ? [derived] : [])].filter((b) => !e.fix?.hide_blocks?.includes(b.label));
  const text = blocks.map((b) => `${b.label}: ${b.lines.slice(0, 3).join(' / ')}${b.lines.length > 3 ? ` 他${b.lines.length - 3}件` : ''}`).join(' ; ');
  const slots = e.slots?.length ? `日別の時間帯 ${e.slots.length}件` : '';
  const notes = e.fix?.notes?.length ? `注記: ${e.fix.notes.join(' / ')}` : '';
  return esc([text, slots, notes].filter((x) => x !== '').join(' ; '));
}

const FIELD_LABEL: Record<string, string> = { name: '名前', start: '開始', end: '終了', group: '小見出し', section: 'セクション', color: '文字の色', edge_color: '縁の色', notes: '注記', hide_blocks: '内容の非表示', add_blocks: '内容の追加' };
/** 修正の列: `修正: 開始・終了`(overrides.json)。 */
const fixedOf = (e: ExportEvent): string => (e.fix ? `修正: ${e.fix.fields.map((f) => FIELD_LABEL[f] ?? f).join('・')}` : '');

const day = (iso: string): string => iso.slice(0, 10);
/** 年付きの JST `YYYY-MM-DD HH:MM`(manual.json の書式と同じ。誤りの修正にそのまま使える)。 */
const jst = (iso: string): string => new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
const period = (e: { start: string; end: string | null }): string => `${jst(e.start)}〜${e.end === null ? '終了未定' : jst(e.end)}`;

export type Verdict = '表示' | '非表示' | '要判断';

/** 表示されない項目(選択で非表示・要判断、または manual.json の hide)。 */
export interface HiddenItem {
  event: ExportEvent;
  verdict: '非表示' | '要判断';
  reason: string;
}

export interface LedgerOptions {
  hidden?: readonly HiddenItem[];
  /** 表示する公式の項目の判定の理由(判断の記憶・ルール名)。無ければ空 */
  reasonOf?: (e: ExportEvent) => string;
}

export interface LedgerRow {
  verdict: Verdict;
  reason: string;
  section: string;
  group: string;
  label: string;
  id: string;
  source: '公式' | '手動(add)' | '定例日程';
  start: string;
  end: string | null;
  url: string;
  content: string;
  /** 手動の修正が入っている項目(直した項目名。無ければ空) */
  fixed: string;
}

/** その月に掛かる項目を、画面と同じ順で。events は表示の選択・手動の調整を適用済みで、同ラベル統合の前のもの。 */
export function ledgerRows(events: ExportEvent[], month: string, opts: LedgerOptions = {}): LedgerRow[] {
  const days = monthDays(month);
  const first = days[0] as string;
  const last = days[days.length - 1] as string;
  const monthly = monthlyEvents(first, last, MONTHLY);
  const all = [...events, ...monthly];
  const bySource = new Map<string, ExportEvent[]>();
  for (const e of all) {
    const sec = sectionOfEvent(e);
    if (!sec || e.id.endsWith(EVENT_QUEST_SUFFIX) || !barSpan(e, days)) continue;
    const k = `${sec.id}\u0000${rowKey(e)}`;
    bySource.set(k, [...(bySource.get(k) ?? []), e]);
  }
  const out: LedgerRow[] = [];
  // 新限定キャラは画面ではガチャのバーの中に畳まれる。項目IDを台帳で調べられるよう、そのガチャの直後に行として出す
  const hosted = newLimitedHosts(all);
  const sourceOf = (e: ExportEvent): LedgerRow['source'] => (e.article_id === 'monthly' ? '定例日程' : e.article_id === 'manual' ? '手動(add)' : '公式');
  for (const { section, rows } of ganttSections(all, days)) {
    let shown = 0;
    for (const row of rows) {
      const rep = (row[0] as { event: ExportEvent }).event;
      const srcs = bySource.get(`${section.id}\u0000${rowKey(rep)}`);
      if (!srcs) continue;
      const group = section.id === 'quest' ? questGroup(rep) : section.id === 'gacha' ? gachaGroup(rep) ?? '' : (campaignGroup(rep) ?? (shown > 0 ? 'その他' : ''));
      shown++;
      const l = rowLabel(section.id, rep);
      const label = l.l2 ? `${l.l1} / ${l.l2}` : l.l1;
      const monthlyRow = srcs.every((s) => s.article_id === 'monthly');
      const list = monthlyRow ? [srcs[0] as ExportEvent] : [...srcs].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
      for (const s of list) {
        out.push({
          verdict: '表示',
          reason: monthlyRow || s.article_id === 'manual' ? '' : opts.reasonOf?.(s) ?? '',
          section: section.label,
          group,
          label,
          id: monthlyRow ? `monthly:${s.name}` : s.id,
          source: sourceOf(s),
          start: s.start,
          end: monthlyRow ? null : s.end,
          url: s.url,
          fixed: monthlyRow ? '' : fixedOf(s),
          content: monthlyRow ? `毎月 ${srcs.map((x) => Number(day(x.start).slice(8))).join('・')}日` : contentOf(s),
        });
        for (const c of hosted.get(s.id) ?? []) {
          const cl = rowLabel(section.id, c);
          out.push({ verdict: '表示', reason: opts.reasonOf?.(c) ?? '', section: section.label, group, label: cl.l2 ? `${cl.l1} / ${cl.l2}` : cl.l1, id: c.id, source: sourceOf(c), start: c.start, end: c.end, url: c.url, fixed: fixedOf(c), content: `${contentOf(c)}(ガチャのバーに表示)` });
        }
      }
    }
  }
  for (const e of events.filter((x) => x.category === MAINTENANCE_CATEGORY && barSpan(x, days)).sort((a, b) => a.start.localeCompare(b.start))) {
    out.push({ verdict: '表示', reason: '常に表示', section: 'メンテナンス', group: '', label: e.name, id: e.id, source: sourceOf(e), start: e.start, end: e.end, url: e.url, content: contentOf(e), fixed: fixedOf(e) });
  }
  // 非表示・要判断の項目: 各セクションの末尾(開始順)
  const hidden = [...(opts.hidden ?? [])].filter((h) => barSpan(h.event, days)).sort((a, b) => a.event.start.localeCompare(b.event.start) || a.event.id.localeCompare(b.event.id));
  for (const h of hidden) {
    const e = h.event;
    const sec = sectionOfEvent(e);
    const l = sec ? rowLabel(sec.id, e) : null;
    const group = sec?.id === 'quest' ? questGroup(e) : sec?.id === 'gacha' ? gachaGroup(e) ?? '' : sec?.id === 'campaign' ? campaignGroup(e) ?? 'その他' : '';
    out.push({ verdict: h.verdict, reason: h.reason, section: sec?.label ?? '-', group, label: l ? (l.l2 ? `${l.l1} / ${l.l2}` : l.l1) : e.name, id: e.id, source: sourceOf(e), start: e.start, end: e.end, url: e.url, content: contentOf(e), fixed: fixedOf(e) });
  }
  // セクションの順(画面と同じ → メンテナンス → どこにも入らないもの)。同じセクションでは表示が先(安定ソート)
  const rank = (label: string): number => (label === 'メンテナンス' ? SECTIONS.length : label === '-' ? SECTIONS.length + 1 : SECTIONS.findIndex((x) => x.label === label));
  return out.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.section) - rank(b.r.section) || a.i - b.i).map((x) => x.r);
}

/** 月ごとの台帳(Markdown)。表示範囲の月だけ。 */
export function renderLedger(events: ExportEvent[], today: string, opts: LedgerOptions = {}): Map<string, string> {
  const { from, to } = windowRange(today);
  const out = new Map<string, string>();
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) {
    const rows = ledgerRows(events, m, opts);
    if (rows.length === 0) continue;
    const n = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
    const link = (r: LedgerRow): string => (r.url ? `[記事](${r.url})` : '');
    out.set(
      m,
      [
        LEDGER_MARK,
        `# カレンダーの台帳 ${m}`,
        '',
        '自動生成です(`npm run update` が作り直します)。**編集しないでください**。この月に掛かる収集した項目を、判定(表示 / 非表示 / 要判断。要判断は判断するまで非表示)つきで並べています。表示する項目は画面と同じ順(セクション→小見出し→行)、非表示・要判断の項目は各セクションの末尾です。誤りを見つけたら項目ID(`id`)を控えて直してください。期間・名前・内容は `config/schedule/overrides.json`(docs/operations.md §17)、表示するかどうかは判断の記憶 `config/judge/decisions.json`・ルール `config/judge/rules.json`(要対応の Issue の `/apply` でも直せます。§2.1)、表示から外すだけなら `manual.json` の `hide`(§14)。「修正」の列は手動の修正が入っている項目で、期間・内容・名前は修正後の値です。',
        '',
        `表示 ${n('表示')}件 / 非表示 ${n('非表示')}件 / 要判断 ${n('要判断')}件。カレンダーの暦(JST 0:00〜24:00)でこの月に掛かる項目です(複数の月にまたがる項目は各月に載ります)。同じ名前の行は画面では1行にまとまります。内容は先頭の数件だけで、全文は公式記事です。`,
        '',
        '| 判定 | セクション | 小見出し | 表示名 | 期間 | 内容 | 出どころ | 修正 | 理由 | 項目ID | 記事 |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
        ...rows.map((r) => `| ${r.verdict} | ${r.section} | ${r.group} | ${esc(r.label)} | ${r.id.startsWith('monthly:') ? '' : period(r)} | ${r.content} | ${r.source} | ${r.fixed} | ${esc(r.reason)} | \`${esc(r.id)}\` | ${link(r)} |`),
        '',
      ].join('\n'),
    );
  }
  return out;
}

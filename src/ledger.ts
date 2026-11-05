// 台帳: 最終的にカレンダーに出る項目(記事・期間・内容)を月別の表にする純関数。spec §4.10。
// 画面と同じ順(セクション→小見出し→行)で並べ、誤りを見つけたときに項目IDを引けるようにする。生成物なので手で編集しない。
import { type ExportEvent } from './data/export';
import { normalQuestBlock, type DetailBlock } from './details';
import { MONTHLY, monthlyEvents } from './monthly';
import { EVENT_QUEST_SUFFIX, MAINTENANCE_CATEGORY, gachaGroup, sectionOfEvent } from './sections';
import { addMonths, windowRange } from './window';
import { JST_OFFSET_MS } from './jst';
import { barSpan, campaignGroup, ganttSections, monthDays, questGroup, rowKey, rowLabel } from './week';

export const LEDGER_MARK = '<!-- generated: npm run ledger -->';

const esc = (t: string): string => t.replace(/\|/g, '｜').replace(/\n/g, ' ');

/** 内容の列: ブロックごとに `見出し: 行 / 行`。長いものは先頭だけ(全文は公式記事)。 */
function contentOf(e: ExportEvent): string {
  const derived = normalQuestBlock(e);
  const blocks: DetailBlock[] = [...(e.details ?? []), ...(derived ? [derived] : [])];
  const text = blocks.map((b) => `${b.label}: ${b.lines.slice(0, 3).join(' / ')}${b.lines.length > 3 ? ` 他${b.lines.length - 3}件` : ''}`).join(' ; ');
  const slots = e.slots?.length ? `日別の時間帯 ${e.slots.length}件` : '';
  return esc([text, slots].filter((x) => x !== '').join(' ; '));
}

const day = (iso: string): string => iso.slice(0, 10);
/** 年付きの JST `YYYY-MM-DD HH:MM`(manual.json の書式と同じ。誤りの修正にそのまま使える)。 */
const jst = (iso: string): string => new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
const period = (e: { start: string; end: string | null }): string => `${jst(e.start)}〜${e.end === null ? '終了未定' : jst(e.end)}`;

export interface LedgerRow {
  section: string;
  group: string;
  label: string;
  id: string;
  source: '公式' | '手動(add)' | '定例日程';
  start: string;
  end: string | null;
  url: string;
  content: string;
}

/** その月に掛かる項目を、画面と同じ順で。events は表示の選択・手動の調整を適用済みで、同ラベル統合の前のもの。 */
export function ledgerRows(events: ExportEvent[], month: string): LedgerRow[] {
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
          section: section.label,
          group,
          label,
          id: monthlyRow ? `monthly:${s.name}` : s.id,
          source: sourceOf(s),
          start: s.start,
          end: monthlyRow ? null : s.end,
          url: s.url,
          content: monthlyRow ? `毎月 ${srcs.map((x) => Number(day(x.start).slice(8))).join('・')}日` : contentOf(s),
        });
      }
    }
  }
  for (const e of events.filter((x) => x.category === MAINTENANCE_CATEGORY && barSpan(x, days)).sort((a, b) => a.start.localeCompare(b.start))) {
    out.push({ section: 'メンテナンス', group: '', label: e.name, id: e.id, source: sourceOf(e), start: e.start, end: e.end, url: e.url, content: contentOf(e) });
  }
  return out;
}

/** 月ごとの台帳(Markdown)。表示範囲の月だけ。 */
export function renderLedger(events: ExportEvent[], today: string): Map<string, string> {
  const { from, to } = windowRange(today);
  const out = new Map<string, string>();
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) {
    const rows = ledgerRows(events, m);
    if (rows.length === 0) continue;
    const link = (r: LedgerRow): string => (r.url ? `[記事](${r.url})` : '');
    out.set(
      m,
      [
        LEDGER_MARK,
        `# カレンダーの台帳 ${m}`,
        '',
        '自動生成です(`npm run update` が作り直します)。**編集しないでください**。カレンダーにこの月に出る項目を、画面と同じ順(セクション→小見出し→行)で並べています。誤りを見つけたら、項目ID(`id`)を控えて修正してください(修正の方法は docs/operations.md)。',
        '',
        `${rows.length}件。カレンダーの暦(JST 0:00〜24:00)でこの月に掛かる項目です。同じ名前の行は画面では1行にまとまります。内容は先頭の数件だけで、全文は公式記事です。`,
        '',
        '| セクション | 小見出し | 表示名 | 期間 | 内容 | 出どころ | 項目ID | 記事 |',
        '|---|---|---|---|---|---|---|---|',
        ...rows.map((r) => `| ${r.section} | ${r.group} | ${esc(r.label)} | ${r.id.startsWith('monthly:') ? '' : period(r)} | ${r.content} | ${r.source} | \`${esc(r.id)}\` | ${link(r)} |`),
        '',
      ].join('\n'),
    );
  }
  return out;
}

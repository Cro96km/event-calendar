// 正本 → UI用の月別JSON。月境界はゲーム日(4:00 JST)基準。none を除く全件。spec §5.2。
import { gameDayOf } from '../gameday';
import { itemKey } from '../selection';
import type { DetailBlock } from '../details';
import { eventUrl, type PickupInfo, type Slot } from '../period';
import type { ArticleRecord } from './record';

export interface ExportEvent {
  id: string;
  article_id: string;
  name: string;
  title: string;
  category: string;
  start: string;
  end: string | null;
  reward_until: string | null;
  url: string;
  /** 選択ファイルの候補キー(spec §4.5)。無い場合は記事タイトルから算出 */
  item?: string;
  /** 項目自身に期間が無く記事の主期間を継承 */
  inherited?: true;
  /** 記事本文の対象ステージ/クエスト(spec §4.7) */
  details?: DetailBlock[];
  /** 全体期間の中の日別の時間帯(バーは全体期間で1本、詳細パネルに表で出す) */
  slots?: Slot[];
  /** コラボガチャのピックアップの回(通常ガチャの行の直下に並べる。spec §4.3.8) */
  pickup?: PickupInfo;
  /** 超究極・絶級のボス名の公式の色(行ラベルの文字用) */
  color?: string;
}

export interface MonthFile {
  month: string;
  events: ExportEvent[];
}

export interface IndexFile {
  generated_at: string;
  months: string[];
  categories: string[];
}

const monthOf = (ms: number): string => gameDayOf(new Date(ms)).slice(0, 7);

/** [first, last] の各月 (YYYY-MM)。 */
function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number) as [number, number];
  while (`${y}-${String(m).padStart(2, '0')}` <= last) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

export function buildExport(records: ArticleRecord[], generatedAt: string): { months: MonthFile[]; index: IndexFile } {
  const byMonth = new Map<string, ExportEvent[]>();
  const categories = new Set<string>();
  for (const r of records) {
    if (r.parse_status === 'none') continue;
    for (const e of r.events) {
      const start = Date.parse(e.start);
      // 終了が丁度ゲーム日の境界(4:00)なら、その直前の瞬間が属する月までとする
      const last = e.end === null ? start : Math.max(start, Date.parse(e.end) - 1);
      const ev: ExportEvent = {
        id: e.id,
        article_id: r.id,
        name: e.name,
        title: r.title,
        category: r.category,
        start: e.start,
        end: e.end,
        reward_until: r.reward_until,
        url: eventUrl(r.url, e),
        // ピックアップの回は通常ガチャの行と同じ候補キー(表示/非表示の判断が揃い、候補も増えない)
        item: itemKey(r.title, (e.pickup && r.events.find((x) => x.id === e.pickup?.mainId)) || e),
        ...(e.inherited ? { inherited: true as const } : {}),
        ...(e.details ? { details: e.details } : {}),
        ...(e.slots ? { slots: e.slots } : {}),
        ...(e.pickup ? { pickup: e.pickup } : {}),
        ...(e.color ? { color: e.color } : {}),
      };
      categories.add(r.category);
      for (const m of monthsBetween(monthOf(start), monthOf(last))) {
        const list = byMonth.get(m) ?? [];
        list.push(ev);
        byMonth.set(m, list);
      }
    }
  }
  const months = [...byMonth.keys()].sort();
  return {
    months: months.map((month) => ({
      month,
      events: (byMonth.get(month) ?? []).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
    })),
    index: { generated_at: generatedAt, months, categories: [...categories].sort() },
  };
}

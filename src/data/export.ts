// 正本 → UI用の月別JSON。月境界はゲーム日(4:00 JST)基準。none を除く全件。spec §5.2。
import { applyGachaAlias, attributeColor, characterLabel, CHARACTER_CATEGORY, type CharacterKind } from '../characters';
import { gameDayOf } from '../gameday';
import { itemKey } from '../selection';
import type { DetailBlock } from '../details';
import { eventUrl, type PickupInfo, type Slot } from '../period';
import type { ArticleRecord } from './record';

/** ガチャのバーに畳んだ新限定キャラ(表示時のみ)。color=属性色、attr=属性。 */
export interface NewName {
  name: string;
  color?: string;
  attr?: string;
}

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
  /** 超究極クエスト「クエスト名」の形のとき、本文から取ったボスのキャラ名(行ラベル)。src/period.ts */
  boss?: string;
  /** 期間の開始/終了を表示しない(仮置きの期間の常設クエスト用。config/schedule/manual.json の hide_start / hide_end) */
  hide_start?: true;
  hide_end?: true;
  /** 小見出しの指定(手動で足した項目用 config/schedule/manual.json、または手動の修正 config/schedule/overrides.json) */
  group?: string;
  /** セクションの指定(手動の修正 config/schedule/overrides.json) */
  section?: string;
  /** キャラクターの項目(新限定・進化の解禁。§4.13)。at=進化の解禁の日時(バーは解禁日の暦日1日分。詳細には開催期間でなくこれを出す)、gacha=新限定の実装ガチャ名 */
  character?: { kind: CharacterKind; at?: string; gacha?: string };
  /** 表示時にだけ付く(書き出しには含まれない。src/newlimited.ts foldNewLimited): このガチャの実装と同時の新限定キャラの名前・属性色・属性。バーの中に出す */
  new_names?: NewName[];
  /** バーの縁に使う色(表示時に付く。書き出しには含まれない。src/gacha-color.ts: 定例ガチャの属性色) */
  edge_color?: string;
  /** 手動の修正が入っている(config/schedule/overrides.json)。fields=直した項目、notes=詳細に出す注記、hide_blocks=詳細で出さないブロック */
  fix?: { fields: string[]; notes?: string[]; hide_blocks?: string[] };
}

export interface MonthFile {
  month: string;
  events: ExportEvent[];
}

export interface IndexFile {
  /** この index を作った時刻(収集とは限らない) */
  generated_at: string;
  /** 公式サイトから最後に収集した時刻(data/collected.json。未収集・不明なら無い) */
  collected_at?: string;
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

export function buildExport(records: ArticleRecord[], generatedAt: string, collectedAt: string | null = null): { months: MonthFile[]; index: IndexFile } {
  const byMonth = new Map<string, ExportEvent[]>();
  const categories = new Set<string>();
  const push = (ev: ExportEvent, start: number, last: number): void => {
    for (const m of monthsBetween(monthOf(start), monthOf(last))) {
      const list = byMonth.get(m) ?? [];
      list.push(ev);
      byMonth.set(m, list);
    }
  };
  for (const r of records) {
    // 期間が取れなかった記事(none)でも、キャラクターは本文の見出しから取れる
    if (r.parse_status === 'none' && (r.characters ?? []).length === 0) continue;
    for (const e of r.parse_status === 'none' ? [] : r.events) {
      const start = Date.parse(e.start);
      // 終了が丁度ゲーム日の境界(4:00)なら、その直前の瞬間が属する月までとする
      const last = e.end === null ? start : Math.max(start, Date.parse(e.end) - 1);
      const ev: ExportEvent = {
        id: e.id,
        article_id: r.id,
        // 新限定の実装にあたる特殊ガチャは、定例ガチャの名前で表記する(候補キー item は元の名前のまま)
        name: applyGachaAlias(e.name, r.gacha_alias),
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
        ...(e.boss ? { boss: e.boss } : {}),
      };
      categories.add(r.category);
      push(ev, start, last);
    }
    // キャラクター(新限定・進化の解禁)。記事の判定(表示/非表示)とは別に、常に表示する(選択の対象外)
    (r.characters ?? []).forEach((c, i) => {
      const start = Date.parse(c.start);
      const last = c.end === null ? start : Math.max(start, Date.parse(c.end) - 1);
      categories.add(CHARACTER_CATEGORY);
      const color = attributeColor(c.attr);
      push({
        id: `${r.id}#c${i}`, article_id: r.id, name: characterLabel(c), title: r.title, category: CHARACTER_CATEGORY, start: c.start, end: c.end, reward_until: null, url: r.url, item: `${CHARACTER_CATEGORY}:${c.kind}:${c.name}`,
        character: { kind: c.kind, ...(c.at ? { at: c.at } : {}), ...(c.gacha ? { gacha: c.gacha } : {}) },
        ...(color ? { color } : {}),
      }, start, last);
    });
  }
  const months = [...byMonth.keys()].sort();
  return {
    months: months.map((month) => ({
      month,
      events: (byMonth.get(month) ?? []).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
    })),
    index: { generated_at: generatedAt, ...(collectedAt ? { collected_at: collectedAt } : {}), months, categories: [...categories].sort() },
  };
}

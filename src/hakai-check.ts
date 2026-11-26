// 破界の星墓の設定(config/schedule/hakai.json)の点検(DOMなし)。新クエスト(色の対応が無い階層名)と設定の矛盾を見つける。運用は docs/operations.md。
import hakai from '../config/schedule/hakai.json';
import cfg from '../config/display/quest-colors.json';
import { HAKAI_GROUPS_LABEL } from './details';
import { fixedFloors, norm, questNameColor } from './quest-color';

/** 1〜5階層がグループA/Bに分かれる最初の開催の開始日。これ以降の星墓の開催の記事には『本開催の登場ステージ』の表がある(読めなければ形式の変更を疑う)。 */
export const GROUPS_SINCE = '2026-12-01';

/** 設定(config/schedule/hakai.json)の形。 */
export interface HakaiConfig {
  quests: { name: string; color: string }[];
  schedules: { since: string; floors: { floor: number; quest: string }[] }[];
}

interface RecordLike {
  id: string;
  title?: string;
  events: { name: string; start: string; details?: { label: string; lines: string[] }[] }[];
}

export interface HakaiUnknown {
  /** 階層クエスト名(`1階層：` の接頭辞なし) */
  name: string;
  /** 最初に見つかった記事ID・開催の開始日 */
  article: string;
  start: string;
}

export interface HakaiCheck {
  /** 色の対応が無い階層クエスト名(= 新クエスト。config/schedule/hakai.json の quests に追加する) */
  unknown: HakaiUnknown[];
  /** 設定の矛盾(未定義のクエストの参照・階層番号の重複・sinceの形式/順序・色の未定義・名前の重複) */
  problems: string[];
  /** 『本開催の登場ステージ』の表を読めなかった星墓の記事(公式の書式が変わった可能性。パーサ src/details.ts の対応が必要) */
  groupsUnread: { id: string; title: string; start: string }[];
  /** 記事に載っている最大の階層番号(固定の階層は、これより後の番号。ぶつかれば problems に出す) */
  maxArticleFloor: number;
}

/** 設定自体の矛盾を返す(空なら問題なし)。 */
export function configProblems(h: HakaiConfig = hakai, palette: Record<string, string> = cfg.palette): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  const normed: string[] = [];
  for (const q of h.quests) {
    // 照合は正規化(中黒・＆)した名前で行うので、重複・包含も正規化して調べる(包含される後ろの名前は上から最初の一致に負けて使われない)
    const nq = norm(q.name);
    if (names.has(q.name) || normed.includes(nq)) out.push(`quests の名前が重複しています: ${q.name}`);
    else if (normed.some((earlier) => nq.includes(earlier))) out.push(`quests の ${q.name} は、上にある名前を含むため照合で使われません(並びを入れ替えてください)`);
    names.add(q.name);
    normed.push(nq);
    if (!Object.hasOwn(palette, q.color)) out.push(`quests の色が palette にありません: ${q.name} → ${q.color}`);
  }
  let prev = '';
  for (const s of h.schedules) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.since)) out.push(`schedules の since は YYYY-MM-DD: ${s.since}`);
    if (s.since <= prev) out.push(`schedules は since の昇順(重複なし)にしてください: ${prev} → ${s.since}`);
    prev = s.since;
    const floors = new Set<number>();
    for (const f of s.floors) {
      if (floors.has(f.floor)) out.push(`schedules(${s.since}) の階層番号が重複しています: ${f.floor}`);
      floors.add(f.floor);
      if (!names.has(f.quest)) out.push(`schedules(${s.since}) の ${f.floor}階層が quests に無いクエストを参照しています: ${f.quest}`);
    }
  }
  return out;
}

/** 収集済みの記事の破界の星墓の階層クエスト名を調べ、色の対応が無い名前(新クエスト)を返す。 */
export function checkHakai(records: readonly RecordLike[]): HakaiCheck {
  const seen = new Map<string, HakaiUnknown>();
  const groupsUnread: HakaiCheck['groupsUnread'] = [];
  let maxArticleFloor = 0;
  for (const r of records) {
    const mains = r.events.filter((e) => e.name.includes('破界の星墓'));
    for (const e of mains) {
      for (const d of e.details ?? []) {
        const grouped = d.label === HAKAI_GROUPS_LABEL;
        if (!grouped && !/階層.*クエスト/.test(d.label)) continue;
        for (const line of d.lines) {
          // 階層クエスト: `N階層：名` / 本開催の登場ステージ: `N階層 | 名 | 名`(グループA/B)
          const m = grouped ? /^(\d+)階層 \| (.+)$/.exec(line) : /^(\d+)階層\s*[：:]\s*(.+)$/.exec(line);
          if (!m) continue;
          if (!grouped) maxArticleFloor = Math.max(maxArticleFloor, Number(m[1]));
          for (const name of (grouped ? (m[2] as string).split(' | ') : [m[2] as string]).map((x) => x.trim())) {
            const key = norm(name);
            if (questNameColor(name) === undefined && !seen.has(key)) seen.set(key, { name, article: r.id, start: e.start.slice(0, 10) });
          }
        }
      }
    }
    // グループA/Bの開催の告知記事(タイトルに「破界の星墓」と「登場」)で、表を読めなかった
    const start = mains[0]?.start.slice(0, 10);
    if (start !== undefined && start >= GROUPS_SINCE && /破界の星墓/.test(r.title ?? '') && /登場/.test(r.title ?? '') && !mains.some((e) => e.details?.some((d) => d.label === HAKAI_GROUPS_LABEL))) {
      groupsUnread.push({ id: r.id, title: r.title as string, start });
    }
  }
  const problems = configProblems();

  // 記事が固定の階層と同じ番号まで載せるようになったら、固定の階層の見直しが必要(記事の階層が優先され、固定の階層は追加されない)
  const clash = fixedFloors().filter((f) => f.floor <= maxArticleFloor);
  if (clash.length > 0) problems.push(`記事が ${maxArticleFloor}階層まで載せています。固定の階層(${clash.map((f) => `${f.floor}階層`).join('・')})を見直してください(config/schedule/hakai.json の schedules に新しい版を足す)`);
  return { unknown: [...seen.values()], problems, groupsUnread, maxArticleFloor };
}

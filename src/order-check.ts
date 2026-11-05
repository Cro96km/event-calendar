// 表示順の設定(config/display/order.json)の点検。純関数。spec §4.3.8
import order from '../config/display/order.json';
import { CAMPAIGN_GROUPS, GACHA_GROUPS, QUEST_GROUPS, ROW_RULES } from './sections';

const SORTS = ['fixed', 'name', 'start', 'builtin'];
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && new Set(a).size === a.length && b.every((x) => a.includes(x));

/** order.json の誤り。groups は固定の小見出しと過不足なく一致させる(ミッション等の追加・削除はコードの変更を伴うため)。 */
export function orderProblems(cfg: typeof order = order): string[] {
  const p: string[] = [];
  if (!same(cfg.sections, ['quest', 'campaign', 'gacha'])) p.push('sections は quest・campaign・gacha を1回ずつ');
  if (!same(cfg.groups.quest, QUEST_GROUPS)) p.push(`groups.quest は ${QUEST_GROUPS.join(' / ')} を1回ずつ`);
  if (!same(cfg.groups.gacha, GACHA_GROUPS)) p.push(`groups.gacha は ${GACHA_GROUPS.join(' / ')} を1回ずつ`);
  if (new Set(CAMPAIGN_GROUPS).size !== CAMPAIGN_GROUPS.length) p.push('groups.campaign に重複があります');
  const known = new Set<string>([...cfg.groups.quest, ...cfg.groups.gacha, ...cfg.groups.campaign]);
  for (const [g, r] of Object.entries(ROW_RULES)) {
    if (!known.has(g)) p.push(`rows「${g}」: 存在しない小見出し`);
    if (!SORTS.includes(r.sort)) p.push(`rows「${g}」: sort は ${SORTS.join(' / ')}`);
    if (r.sort === 'fixed' && (r.words ?? []).some((w) => w.trim() === '')) p.push(`rows「${g}」: words に空の語があります`);
    if (r.sort !== 'fixed' && (r.words !== undefined || r.then !== undefined)) p.push(`rows「${g}」: words・then は sort=fixed のときだけ`);
  }
  for (const x of cfg.classify.campaign.extra_groups) if (!cfg.groups.campaign.includes(x)) p.push(`classify.campaign.extra_groups: groups.campaign に無い「${x}」`);
  for (const [k, v] of Object.entries(cfg.classify.campaign.group_aliases)) if (!cfg.groups.campaign.includes(v)) p.push(`classify.campaign.group_aliases「${k}」: groups.campaign に無い「${v}」`);
  return p;
}

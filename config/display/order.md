# order.json の書き方(記入例)

`order.json` は、**表示順の唯一の設定**です(セクション・小見出し・行の並び)。JSON にはコメントを書けないため、記入例はこのファイルに置きます(各キーの意味は `order.json` の先頭の `_doc`、詳細は `docs/spec.md` §4.3.8)。直接編集してください。書式の誤りは `npm run check` と CI が検知します。

## 行の並びを変える(`rows`)

小見出し名をキーに、並べ方(`sort`)を決めます。

```json
{
  "rows": {
    "英雄の神殿": { "sort": "fixed", "words": ["ノーコン", "タイムボーナス", "*", "特L"] },
    "期間限定クエスト": { "sort": "name" },
    "ノーマルクエスト": { "sort": "start" }
  }
}
```

- `fixed`: `words` の順に並べます。項目名に語を含む行がその順に並び、どれにも一致しない行は `"*"` の位置(書かなければ末尾)に入ります。同じ順位の行は名前順(`"then": "start"` を足すと開始順)です。
- `name`: 表示名の五十音順です。
- `start`: 開始の早い順です(`rows` に書かない小見出しも同じです)。
- `builtin`: コードで決まっています(イベント=通常→コラボ、超究極)。変えられません。
- 定例クエスト・定例ガチャの `words` は、その小見出しに入れる項目の判定も兼ねます。語を足すと、その語を含む項目が定例に入ります。

## 小見出しの順を変える(`groups`)

```json
{
  "groups": {
    "quest": ["イベントクエスト", "定例クエスト", "常設クエスト", "絶級クエスト", "期間限定クエスト", "超究極クエスト", "その他"]
  }
}
```

並べ替えだけできます。名前を足したり消したりはできません(コードの変更が要ります)。キャンペーンの `groups.campaign` は、名称に含まれる語でもあります(`classify.campaign.extra_groups` の「ミッション」だけは、語で振り分けません)。

## セクションを足す・並べ替える(`sections`)

```json
{
  "sections": [
    { "id": "quest", "label": "クエスト", "hue": 215, "categories": ["event"] },
    { "id": "special", "label": "特別企画", "hue": 40, "categories": [] },
    { "id": "campaign", "label": "キャンペーン", "hue": 140, "categories": ["campaign", "web-shop"] },
    { "id": "gacha", "label": "ガチャ", "hue": 340, "categories": ["collab"] }
  ]
}
```

- 上から順に表示します。上の例では「特別企画」がクエストとキャンペーンの間に入ります。
- `id` は英小文字・数字・ハイフン、`hue` は色相(0〜359)です。`quest`・`campaign`・`gacha` は必須です。
- 足したセクションは小見出しを持ちません。項目は `config/schedule/overrides.json` の `section`(`"section": "special"`)で入れます。`categories` は空にします。

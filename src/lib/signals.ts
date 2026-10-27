import type { Metric, Signal } from "@/lib/types";

/** Business-environment topics. A sentence can belong to several. */
export const CATEGORIES: Array<{ category: string; keywords: RegExp }> = [
  { category: "需要・販売", keywords: /需要|受注|販売|顧客|出荷|客数|販売数量|引き合い|消費/ },
  { category: "価格・原価", keywords: /価格|原価|原材料|値上げ|価格改定|価格転嫁|コスト|仕入|資材/ },
  { category: "為替", keywords: /為替|円安|円高|ドル|ユーロ|人民元/ },
  { category: "供給・生産", keywords: /供給|調達|在庫|生産|物流|半導体|稼働|工場|サプライチェーン/ },
  { category: "人件費・人材", keywords: /人件費|賃上げ|人材|採用|人手不足|従業員/ },
  { category: "金利・資金", keywords: /金利|借入|資金調達|有利子負債|利上げ/ },
  { category: "海外・地政学", keywords: /中国|米国|欧州|アジア|海外|地政学|関税|ウクライナ|中東/ },
  { category: "成長投資・新規事業", keywords: /投資|M&A|買収|新規事業|研究開発|DX|AI|デジタル|設備投資/ },
  { category: "構造改革・コスト削減", keywords: /構造改革|合理化|効率化|コスト削減|撤退|再編|減損/ },
  { category: "業績予想", keywords: /業績予想|通期|見通し|計画|予想|ガイダンス|修正/ },
  { category: "株主還元", keywords: /配当|自己株式|自社株|還元|配当性向|DOE/ },
];

export function categorize(sentence: string): string[] {
  return CATEGORIES.filter(({ keywords }) => keywords.test(sentence)).map((c) => c.category);
}

/** Words that make a change matter regardless of how much text moved. */
export const MATERIAL_TERMS =
  /上方修正|下方修正|増配|減配|復配|無配|特別損失|減損|過去最高|最高益|赤字|黒字転換|自己株式の取得|据え置|継続企業|中期経営計画/;

type State = { label: string; direction: 1 | 0 | -1 };

function guidanceState(text: string): State {
  if (/(業績予想|通期|予想)[^。]{0,40}上方修正|上方修正[^。]{0,20}(いた|する|しま)/.test(text))
    return { label: "上方修正", direction: 1 };
  if (/(業績予想|通期|予想)[^。]{0,40}下方修正|下方修正[^。]{0,20}(いた|する|しま)/.test(text))
    return { label: "下方修正", direction: -1 };
  if (/(業績予想|通期|予想)[^。]{0,40}(据え置|変更(は|も)?(あり|して)?(ません|おりません)|修正(は|も)?(あり|して)?(ません|おりません))/.test(text))
    return { label: "据え置き", direction: 0 };
  if (/(業績予想|通期の見通し)/.test(text)) return { label: "言及あり", direction: 0 };
  return { label: "記載なし", direction: 0 };
}

function dividendState(text: string): State {
  if (/増配/.test(text)) return { label: "増配", direction: 1 };
  if (/復配/.test(text)) return { label: "復配", direction: 1 };
  if (/減配/.test(text)) return { label: "減配", direction: -1 };
  if (/無配|配当を見送/.test(text)) return { label: "無配", direction: -1 };
  if (/記念配当|特別配当/.test(text)) return { label: "記念・特別配当", direction: 1 };
  if (/配当[^。]{0,30}(据え置|変更(は|も)?(あり|して)?(ません|おりません))/.test(text))
    return { label: "据え置き", direction: 0 };
  if (/配当/.test(text)) return { label: "言及あり", direction: 0 };
  return { label: "記載なし", direction: 0 };
}

function buybackState(text: string): State {
  if (/自己株式[^。]{0,10}(の)?取得|自社株買い/.test(text)) return { label: "実施・予定あり", direction: 1 };
  return { label: "記載なし", direction: 0 };
}

export function detectSignals(previous: string, current: string): Signal[] {
  const entries: Array<[Signal["key"], string, (t: string) => State]> = [
    ["guidance", "業績予想", guidanceState],
    ["dividend", "配当", dividendState],
    ["buyback", "自己株式取得", buybackState],
  ];
  return entries.map(([key, label, detect]) => {
    const before = detect(previous);
    const after = detect(current);
    const changed = before.label !== after.label;
    return {
      key,
      label,
      before: before.label,
      after: after.label,
      changed,
      direction: changed ? after.direction : 0,
    };
  });
}

const METRIC_NAMES: Array<[name: string, pattern: string]> = [
  ["売上高", "(?:売上高|売上収益|営業収益)"],
  ["営業利益", "(?:営業利益|営業損失)"],
  ["経常利益", "(?:経常利益|経常損失)"],
  ["純利益", "(?:親会社株主に帰属する(?:当期|四半期)?純利益|(?:当期|四半期)純利益)"],
];

const AMOUNT = "([△▲-]?[0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(百万円|億円|千円|万円|兆円)";
const YOY = "(?:前年同期比|前期比|前年比)\\s*([0-9.,]+%\\s*[増減])";

function findMetric(text: string, pattern: string) {
  const re = new RegExp(`${pattern}[はがも]?[、,]?\\s*${AMOUNT}(?:[^。]{0,8}?${YOY})?`);
  const match = text.match(re);
  if (!match) return undefined;
  return { value: `${match[1]}${match[2]}`, yoy: match[3]?.replace(/\s/g, "") };
}

/** Best-effort extraction of headline figures written in narrative sentences. */
export function extractMetrics(previous: string, current: string): Metric[] {
  return METRIC_NAMES.flatMap(([name, pattern]) => {
    const before = findMetric(previous, pattern);
    const after = findMetric(current, pattern);
    if (!before && !after) return [];
    return [{ name, before: before?.value, after: after?.value, beforeYoY: before?.yoy, afterYoY: after?.yoy }];
  });
}

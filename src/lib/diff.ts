export type ToneLabel = "強気" | "やや強気" | "中立" | "やや慎重" | "慎重";

export interface RephrasedPair {
before: string;
after: string;
similarity: number;
}

export interface EnvironmentChange {
category: string;
added: string[];
removed: string[];
}

export interface AiSummary {
headline: string;
overallAssessment: string;
toneReason: string;
businessEnvironmentChanges: string[];
keyChanges: string[];
watchPoints: string[];
risks: string[];
}

export interface AnalysisResult {
previousSentenceCount: number;
currentSentenceCount: number;
added: string[];
removed: string[];
rephrased: RephrasedPair[];
unchangedCount: number;
previousToneScore: number;
currentToneScore: number;
previousToneLabel: ToneLabel;
currentToneLabel: ToneLabel;
environmentChanges: EnvironmentChange[];
summaryLines: string[];
aiSummary?: AiSummary;
}

const BULLISH_WORDS: Array<[string, number]> = [
["上方修正", 4],
["最高益", 4],
["増配", 3],
["増益", 3],
["好調", 3],
["想定を上回", 3],
["上振れ", 3],
["拡大", 2],
["成長", 2],
["回復", 2],
["改善", 2],
["堅調", 2],
["順調", 1],
["底堅", 1],
["追い風", 2],
];

const BEARISH_WORDS: Array<[string, number]> = [
["下方修正", 4],
["赤字", 4],
["減配", 3],
["減益", 3],
["悪化", 3],
["想定を下回", 3],
["下振れ", 3],
["不透明", 2],
["懸念", 2],
["厳しい", 2],
["減少", 1],
["落ち込", 2],
["遅延", 2],
["向かい風", 2],
];

const ENVIRONMENT_CATEGORIES: Array<{ category: string; keywords: string[]}> = [
{ category: "需要", keywords: ["需要", "受注", "販売", "顧客", "市場環境", "出荷"]},
{ category: "価格・原価", keywords: ["価格", "原価", "原材料", "値上げ", "コスト", "調達価格"]},
{ category: "為替", keywords: ["為替", "円安", "円高", "ドル", "ユーロ"]},
{ category: "供給・調達", keywords: ["供給", "調達", "在庫", "生産", "物流", "半導体"]},
{ category: "見通し・還元", keywords: ["見通し", "予想", "計画", "配当", "自社株買い", "還元"]},
];

/** Split Japanese documents into sentences, keeping headings as short units too. */
export function splitSentences(text: string): string[] {
return text
.replace(/\r\n/g, "\n")
.split(/(?<=[。！？])|\n+/)
.map((s) => s.trim())
.filter((s) => s.length >= 4);
}

export function normalizeSentence(sentence: string): string {
return sentence
.toLowerCase()
.replace(/[\s　]/g, "")
.replace(/[、。，．・：:；;「」『』（）()\[\]<>＜＞"“”'’]/g, "");
}

function bigrams(value: string): Set<string> {
const set = new Set<string>();
for (let i = 0; i < value.length - 1; i += 1) {
set.add(value.slice(i, i + 2));
}
return set;
}

/** Character-bigram Jaccard similarity. Good enough for Japanese wording changes. */
export function similarity(a: string, b: string): number {
const aSet = bigrams(normalizeSentence(a));
const bSet = bigrams(normalizeSentence(b));
if (aSet.size === 0 || bSet.size === 0) return 0;
let intersection = 0;
for (const item of aSet) {
if (bSet.has(item)) intersection += 1;
}
return intersection / (aSet.size + bSet.size - intersection);
}

export function toneScore(text: string): number {
let score = 0;
for (const [word, weight] of BULLISH_WORDS) {
score += countOccurrences(text, word) * weight;
}
for (const [word, weight] of BEARISH_WORDS) {
score -= countOccurrences(text, word) * weight;
}
return score;
}

export function toneLabel(score: number): ToneLabel {
if (score >= 6) return "強気";
if (score >= 2) return "やや強気";
if (score <= -6) return "慎重";
if (score <= -2) return "やや慎重";
return "中立";
}

function countOccurrences(text: string, word: string): number {
if (!word) return 0;
return text.split(word).length - 1;
}

function truncate(sentence: string, max = 90): string {
return sentence.length > max? `${sentence.slice(0, max)}…`: sentence;
}

export function analyzeEarningsTexts(previousText: string, currentText: string): AnalysisResult {
const previousSentences = splitSentences(previousText);
const currentSentences = splitSentences(currentText);

const currentByNormalized = new Map<string, number[]>();
currentSentences.forEach((sentence, index) => {
const key = normalizeSentence(sentence);
const list = currentByNormalized.get(key)?? [];
list.push(index);
currentByNormalized.set(key, list);
});

const usedCurrent = new Set<number>();
const removedCandidates: string[] = [];
let unchangedCount = 0;

for (const sentence of previousSentences) {
const key = normalizeSentence(sentence);
const candidates = currentByNormalized.get(key)?? [];
const matchIndex = candidates.find((index) =>!usedCurrent.has(index));
if (matchIndex!== undefined) {
usedCurrent.add(matchIndex);
unchangedCount += 1;
} else {
removedCandidates.push(sentence);
}
}

const addedCandidates = currentSentences.filter((_, index) =>!usedCurrent.has(index));

const rephrased: RephrasedPair[] = [];
const removed: string[] = [];
const pairedAdded = new Set<number>();

for (const before of removedCandidates) {
let bestIndex = -1;
let bestScore = 0;
addedCandidates.forEach((after, index) => {
if (pairedAdded.has(index)) return;
const score = similarity(before, after);
if (score > bestScore) {
bestScore = score;
bestIndex = index;
}
});

if (bestIndex >= 0 && bestScore >= 0.45) {
pairedAdded.add(bestIndex);
rephrased.push({ before, after: addedCandidates[bestIndex], similarity: bestScore});
} else {
removed.push(before);
}
}

const added = addedCandidates.filter((_, index) =>!pairedAdded.has(index));

const previousToneScore = toneScore(previousText);
const currentToneScore = toneScore(currentText);
const previousToneLabel = toneLabel(previousToneScore);
const currentToneLabel = toneLabel(currentToneScore);

const environmentChanges = buildEnvironmentChanges(added, removed, rephrased);
const summaryLines = buildSummaryLines({
added,
removed,
rephrased,
previousToneLabel,
currentToneLabel,
environmentChanges,
});

return {
previousSentenceCount: previousSentences.length,
currentSentenceCount: currentSentences.length,
added,
removed,
rephrased,
unchangedCount,
previousToneScore,
currentToneScore,
previousToneLabel,
currentToneLabel,
environmentChanges,
summaryLines,
};
}

function buildEnvironmentChanges(
added: string[],
removed: string[],
rephrased: RephrasedPair[],
): EnvironmentChange[] {
const changedAdded = [...added,...rephrased.map((pair) => pair.after)];
const changedRemoved = [...removed,...rephrased.map((pair) => pair.before)];

return ENVIRONMENT_CATEGORIES.map(({ category, keywords}) => {
const matches = (sentences: string[]) =>
sentences.filter((sentence) => keywords.some((keyword) => sentence.includes(keyword)));
return {
category,
added: matches(changedAdded).map((s) => truncate(s)),
removed: matches(changedRemoved).map((s) => truncate(s)),
};
}).filter((item) => item.added.length > 0 || item.removed.length > 0);
}

function buildSummaryLines(args: {
added: string[];
removed: string[];
rephrased: RephrasedPair[];
previousToneLabel: ToneLabel;
currentToneLabel: ToneLabel;
environmentChanges: EnvironmentChange[];
}): string[] {
const lines: string[] = [];
lines.push(`トーンは「${args.previousToneLabel}」から「${args.currentToneLabel}」へ変化しました。`);
lines.push(
`文単位では、追加${args.added.length}件、削除${args.removed.length}件、言い換え${args.rephrased.length}件が検出されました。`,
);

for (const change of args.environmentChanges.slice(0, 5)) {
if (change.added.length > 0) {
lines.push(`${change.category}: 今回は「${change.added[0]}」が新たに示されました。`);
} else if (change.removed.length > 0) {
lines.push(`${change.category}: 前回の「${change.removed[0]}」に関する記述が弱まりました。`);
}
}

return lines;
}

export function toPlainTextReport(result: AnalysisResult, companyName = ""): string {
const title = companyName? `${companyName} 決算差分レポート`: "決算差分レポート";
const lines: string[] = [
title,
"",
`トーン: ${result.previousToneLabel} (${result.previousToneScore}pt) → ${result.currentToneLabel} (${result.currentToneScore}pt)`,
"",
"## 要約",
...result.summaryLines.map((line) => `- ${line}`),
...(result.aiSummary
? [
"",
"## AI要約（Gemini Flash）",
`- ${result.aiSummary.headline}`,
`- ${result.aiSummary.overallAssessment}`,
`- トーン判断の理由: ${result.aiSummary.toneReason}`,
...result.aiSummary.businessEnvironmentChanges.map((line) => `- 事業環境: ${line}`),
...result.aiSummary.keyChanges.map((line) => `- 重要な変化: ${line}`),
...result.aiSummary.watchPoints.map((line) => `- 確認ポイント: ${line}`),
...result.aiSummary.risks.map((line) => `- リスク・不確実性: ${line}`),
]
: []),
"",
"## 追加された文言",
...(result.added.length? result.added.map((line) => `- ${line}`): ["- なし"]),
"",
"## 削除された文言",
...(result.removed.length? result.removed.map((line) => `- ${line}`): ["- なし"]),
"",
"## 言い換え",
...(result.rephrased.length
? result.rephrased.flatMap((pair) => [`- 前回: ${pair.before}`, ` 今回: ${pair.after}`])
: ["- なし"]),
"",
"※ 本レポートは決算資料の文言変化を整理するもので、投資助言ではありません。",
];
return lines.join("\n");
}

import type { AnalysisResult, Change, EvidencePoint } from "@/lib/types";

const KIND_LABEL: Record<Change["kind"], string> = {
  added: "追加",
  removed: "削除",
  rephrased: "言い換え",
  numeric: "数値更新",
};

function changeLines(c: Change): string[] {
  const head = `- **${c.id}** ［${KIND_LABEL[c.kind]}・${c.section}］`;
  if (c.before && c.after) return [head, `  - 前回：${c.before}`, `  - 今回：${c.after}`];
  return [`${head} ${c.after ?? c.before}`];
}

function points(title: string, items: EvidencePoint[]): string[] {
  if (!items.length) return [];
  return [
    `### ${title}`,
    ...items.map((p) => `- **${p.title}**：${p.detail}${p.evidence.length ? `（根拠：${p.evidence.join("、")}）` : ""}`),
    "",
  ];
}

/** Markdown report, readable as-is and pasteable into Notion / Slack / docs. */
export function toMarkdownReport(r: AnalysisResult, companyName = ""): string {
  const byId = new Map(r.changes.map((c) => [c.id, c]));
  const title = companyName ? `${companyName} 決算差分（DeltaLens）` : "決算差分（DeltaLens）";
  const lines: string[] = [
    `# ${title}`,
    "",
    `トーン：${r.previousTone.label}（${r.previousTone.score}）→ **${r.currentTone.label}（${r.currentTone.score}）**`,
    "",
  ];

  const signals = r.signals.filter((s) => s.changed);
  if (signals.length) {
    lines.push("## 開示シグナル", ...signals.map((s) => `- ${s.label}：${s.before} → **${s.after}**`), "");
  }

  if (r.aiSummary) {
    const ai = r.aiSummary;
    lines.push("## AI要約", "", `**${ai.headline}**`, "", ai.overview, "");
    lines.push(`トーン判断：${ai.toneDirection}。${ai.toneReason}`, "");
    lines.push(...points("重要な変化", ai.keyPoints), ...points("次に確認したい点", ai.watchPoints), ...points("リスク・不確実性", ai.risks));
  }

  lines.push("## 自動解析の要点", ...r.summaryLines.map((l) => `- ${l}`), "");

  if (r.metrics.length) {
    lines.push("## 本文から抽出した主要数値（参考）", "", "| 項目 | 前回 | 今回 |", "| --- | --- | --- |");
    for (const m of r.metrics) {
      lines.push(
        `| ${m.name} | ${m.before ?? "—"}${m.beforeYoY ? `（${m.beforeYoY}）` : ""} | ${m.after ?? "—"}${m.afterYoY ? `（${m.afterYoY}）` : ""} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 注目の変化", ...r.highlights.flatMap((id) => changeLines(byId.get(id)!)), "");
  lines.push("## すべての変更（資料の順）", ...r.changes.filter((c) => c.kind !== "numeric").flatMap(changeLines), "");
  const numeric = r.changes.filter((c) => c.kind === "numeric");
  if (numeric.length) lines.push("## 数値のみの更新", ...numeric.flatMap(changeLines), "");

  lines.push("---", "※ 決算資料の文言の変化を機械的に整理したもので、投資助言ではありません。");
  return lines.join("\n");
}

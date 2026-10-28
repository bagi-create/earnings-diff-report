/**
 * Render data/out/prototype/*.json into one side-by-side page:
 * DeltaLens full-document analysis (evidence collapsed) vs. the plain "差分を詳細分析して" answer.
 *
 *   npx -y node@22 node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/prototype/render-compare.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Change } from "../../src/lib/types";
import { OUT_DIR } from "../lib/documents";

const PROTO_DIR = join(OUT_DIR, "prototype");
const YEN = 150;

interface Quote {
  doc: string;
  text: string;
  status?: string;
}
interface Finding {
  title: string;
  detail: string;
  confidence: string;
  quotes: Quote[];
  changeIds: string[];
}
interface Usage {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  seconds: number;
}
interface Proto {
  model: string;
  company: { code: string; name: string };
  base: { official: string };
  target: { official: string };
  counts: Record<string, number>;
  changes: Change[];
  removedHistory: Array<{ id: string; count: number; total: number; onlyFullYear: boolean; pattern: string }>;
  alignment: null | {
    removedTotal: number;
    removedChecked: number;
    rephrasedReference: { p10: number; median: number; count: number };
    atLeast: Record<string, number>;
    matches: Array<{ id: string; before: string; bestMatch: string; similarity: number }>;
  };
  deep: {
    headline: string;
    whatHappened: string;
    comparisonNote: string;
    hypotheses: Finding[];
    removedMeaning: Finding[];
    formatDriven: string[];
    peerContext: string;
    watchNext: string[];
    usage: Usage;
  };
  baseline: { text: string; usage: Usage };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/**
 * Minimal Markdown → HTML for the baseline answer (headings, lists, tables, rules, bold).
 * Rendered here so the page needs no script: some viewers block CDN scripts.
 */
function markdown(src: string): string {
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  const lines = src.replace(/\r/g, "").split("\n");
  let list: string | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }
    if (/^\|.*\|$/.test(t)) {
      closeList();
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      i -= 1;
      const [head, ...body] = rows;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    const heading = t.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      closeList();
      out.push("<hr>");
      continue;
    }
    const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (item) {
      const kind = /\d/.test(item[2]) ? "ol" : "ul";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      const depth = Math.floor(item[1].replace(/\t/g, "    ").length / 2);
      out.push(`<li${depth ? ` style="margin-left:${depth * 1.2}em"` : ""}>${inline(item[3])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  return out.join("\n");
}

const yen = (usd: number) => `約${Math.max(1, Math.round(usd * YEN))}円`;
/** Prices are only known for some models; otherwise show the token counts. */
const cost = (u: Usage) =>
  u.usd > 0 ? yen(u.usd) : `入力${Math.round(u.inputTokens / 1000)}k・出力${Math.round(u.outputTokens / 1000)}kトークン`;

const protos: Proto[] = readdirSync(PROTO_DIR)
  .filter((f) => /^\d{4}\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(PROTO_DIR, f), "utf8")) as Proto);

function quoteHtml(q: Quote) {
  const cls = q.status === "一致" ? "ok" : q.status === "ほぼ一致" ? "near" : "ng";
  return `<blockquote class="quote"><span class="qdoc">${esc(q.doc)}</span>${esc(q.text)}<span class="qs ${cls}">原文と${esc(q.status ?? "未確認")}</span></blockquote>`;
}

function changeHtml(c: Change, p: Proto) {
  const kind = { removed: "削除", added: "追加", rephrased: "言い換え", numeric: "数値" }[c.kind];
  const h = p.removedHistory.find((x) => x.id === c.id);
  return `<div class="chg"><div class="chg-h"><span class="k k-${c.kind}">${kind}</span><span class="cid">${esc(c.id)}</span><span class="sec">${esc(c.section)}</span>${
    h ? `<span class="hist">過去の記載 ${h.count}/${h.total}期${h.onlyFullYear ? "・通期だけ" : ""}</span>` : ""
  }</div>${c.before ? `<p class="b"><span>前回</span>${esc(c.before.slice(0, 400))}</p>` : ""}${
    c.after ? `<p class="a"><span>今回</span>${esc(c.after.slice(0, 400))}</p>` : ""
  }</div>`;
}

function findingHtml(f: Finding, p: Proto) {
  const changes = f.changeIds
    .map((id) => p.changes.find((c) => c.id === id))
    .filter((c): c is Change => Boolean(c))
    .slice(0, 4);
  return `<article class="finding">
  <div class="f-h"><h4>${esc(f.title)}</h4><span class="conf conf-${f.confidence}">確からしさ ${esc(f.confidence)}</span></div>
  <p>${esc(f.detail)}</p>
  <details><summary>根拠を見る（原文${f.quotes.length}件・差分${changes.length}件）</summary>
    ${f.quotes.map(quoteHtml).join("")}
    ${changes.map((c) => changeHtml(c, p)).join("")}
  </details>
</article>`;
}

function companyHtml(p: Proto) {
  const d = p.deep;
  const quotes = [...d.hypotheses, ...d.removedMeaning].flatMap((f) => f.quotes);
  const okQuotes = quotes.filter((q) => q.status !== "見つからない").length;
  const fy = p.removedHistory.filter((h) => h.onlyFullYear).length;
  const longGone = p.removedHistory.filter((h) => h.count >= 6);
  return `<section class="co" id="c${p.company.code}">
  <header class="co-h">
    <div><span class="code">${p.company.code}</span><h2>${esc(p.company.name)}</h2></div>
    <p class="period">${esc(p.base.official)} → ${esc(p.target.official)}（決算短信）</p>
  </header>
  <div class="facts">
    <div><b>${p.removedHistory.length}</b><span>機械判定の「削除」</span></div>
    <div><b>${fy}</b><span>うち通期の資料にだけ載る文</span></div>
    <div><b>${p.alignment ? p.alignment.atLeast["0.90"] : "—"}</b><span>うち意味が今回にも残る文（類似度0.90以上${p.alignment ? "" : "・未計測"}）</span></div>
    <div><b>${longGone.length}</b><span>6期以上続いてから消えた文</span></div>
  </div>
  <div class="cols">
    <div class="col ours">
      <div class="col-h"><span class="tag tag-ours">DeltaLens 試作</span><span class="cost">${esc(d.usage.model ?? "")} / 全文＋履歴＋同業比較 / ${cost(d.usage)} / ${d.usage.seconds}秒</span></div>
      <h3 class="headline">${esc(d.headline)}</h3>
      <p class="lead">${esc(d.whatHappened)}</p>
      <div class="note"><b>比べている資料について</b>${esc(d.comparisonNote)}</div>
      <h4 class="sub">起きている可能性のある変化</h4>
      ${d.hypotheses.map((f) => findingHtml(f, p)).join("")}
      <h4 class="sub">消えた言葉が示すこと</h4>
      ${d.removedMeaning.map((f) => findingHtml(f, p)).join("") || '<p class="muted">意味のある削除はなし</p>'}
      ${d.peerContext ? `<h4 class="sub">同業他社と比べて</h4><p>${esc(d.peerContext)}</p>` : ""}
      <h4 class="sub">異変ではない差分（資料の種類の違いなど）</h4>
      <ul>${d.formatDriven.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h4 class="sub">次の決算で確かめたい点</h4>
      <ul>${d.watchNext.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="muted small">引用の照合：${quotes.length}件中${okQuotes}件が原文と一致またはほぼ一致</p>
    </div>
    <div class="col base">
      <div class="col-h"><span class="tag">そのままAIに渡した場合</span><span class="cost">${esc(p.baseline.usage.model ?? "")} / 2つの全文＋「前回と今回の差分を詳細分析して」 / ${cost(p.baseline.usage)} / ${p.baseline.usage.seconds}秒</span></div>
      <div class="md">${markdown(p.baseline.text)}</div>
    </div>
  </div>
  <details class="more"><summary>機械判定の「削除」の内訳を見る</summary>
    <h4 class="sub">6期以上続いてから今回消えた文</h4>
    ${longGone.map((h) => p.changes.find((c) => c.id === h.id)).filter((c): c is Change => Boolean(c)).map((c) => changeHtml(c, p)).join("") || '<p class="muted">なし</p>'}
    ${p.alignment ? `    <h4 class="sub">「削除」と判定されたが、意味は今回の資料に残っている文（上位8件）</h4>
    ${p.alignment!.matches
      .slice(0, 8)
      .map(
        (m) =>
          `<div class="chg"><div class="chg-h"><span class="cid">${esc(m.id)}</span><span class="hist">類似度 ${m.similarity.toFixed(2)}</span></div><p class="b"><span>前回</span>${esc(m.before.slice(0, 300))}</p><p class="a"><span>今回</span>${esc(m.bestMatch.slice(0, 300))}</p></div>`,
      )
      .join("")}
    <p class="muted small">参考：機械判定で「言い換え」とされた${p.alignment!.rephrasedReference.count}組の類似度は中央値 ${p.alignment!.rephrasedReference.median.toFixed(2)}、下位1割 ${p.alignment!.rephrasedReference.p10.toFixed(2)}。</p>` : ""}
  </details>
</section>`;
}

const totalDeep = protos.reduce((s, p) => s + p.deep.usage.usd, 0);
const totalBase = protos.reduce((s, p) => s + p.baseline.usage.usd, 0);

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeltaLens 試作比較</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;700&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#09090b;--panel:#18181b;--panel2:#111113;--line:#27272a;--text:#e4e4e7;--muted:#a1a1aa;--dim:#71717a;--accent:#34d399;--rose:#fb7185;--amber:#fbbf24;--sky:#38bdf8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.75 Inter,"IBM Plex Sans JP",system-ui,sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:32px 16px 80px}
h1{font-size:28px;margin:0 0 8px;letter-spacing:.01em}
.intro{color:var(--muted);max-width:820px;margin:0 0 24px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 32px}
nav a{color:var(--text);text-decoration:none;border:1px solid var(--line);background:var(--panel);padding:6px 12px;border-radius:999px;font-size:13px}
nav a:hover{border-color:var(--accent)}
.totals{color:var(--muted);font-size:13px;margin:-16px 0 32px}
.co{border-top:1px solid var(--line);padding:40px 0 8px}
.co-h{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px}
.co-h h2{display:inline;font-size:24px;margin:0 0 0 10px}
.code{font-family:ui-monospace,monospace;color:var(--dim)}
.period{margin:0;color:var(--muted);font-size:14px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0 20px}
.facts div{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.facts b{display:block;font-size:22px;font-family:ui-monospace,monospace}
.facts span{font-size:12px;color:var(--muted);line-height:1.4;display:block}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.col{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;min-width:0}
.col.ours{border-color:#065f46}
.col.base{max-height:1400px;overflow:auto}
.col-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
.tag{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:#27272a;color:var(--muted)}
.tag-ours{background:#064e3b;color:#a7f3d0}
.cost{font-size:12px;color:var(--dim)}
.headline{font-size:20px;line-height:1.5;margin:4px 0 10px}
.lead{margin:0 0 14px}
.note{background:var(--panel2);border-left:3px solid var(--sky);padding:10px 12px;border-radius:6px;font-size:14px;color:var(--muted);margin-bottom:8px}
.note b{display:block;color:var(--text);font-size:13px}
.sub{font-size:13px;letter-spacing:.04em;color:var(--accent);margin:22px 0 8px}
.finding{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px;background:var(--panel2)}
.f-h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.finding h4{margin:0;font-size:16px}
.finding p{margin:6px 0}
.conf{font-size:11px;white-space:nowrap;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
.conf-高{color:#a7f3d0;border-color:#065f46}.conf-中{color:#fde68a;border-color:#78350f}.conf-低{color:var(--muted)}
details summary{cursor:pointer;color:var(--accent);font-size:13px;margin-top:6px}
.quote{margin:8px 0;padding:8px 10px;border-left:2px solid var(--line);background:#0c0c0e;font-size:13px;color:#d4d4d8}
.qdoc{font-size:11px;color:var(--dim);margin-right:8px}
.qs{display:inline-block;margin-left:8px;font-size:11px;padding:0 6px;border-radius:4px}
.qs.ok{color:#a7f3d0;background:#064e3b}.qs.near{color:#fde68a;background:#78350f}.qs.ng{color:#fecdd3;background:#881337}
.chg{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0;font-size:13px}
.chg-h{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px}
.k{font-size:11px;padding:0 6px;border-radius:4px;background:#27272a}
.k-removed{background:#881337;color:#fecdd3}.k-added{background:#064e3b;color:#a7f3d0}.k-rephrased{background:#78350f;color:#fde68a}
.cid,.sec,.hist{font-size:11px;color:var(--dim)}
.chg p{margin:4px 0;color:#d4d4d8;overflow-wrap:anywhere}
.chg p span{font-size:11px;color:var(--dim);margin-right:6px}
.chg .b{text-decoration:line-through;text-decoration-color:#9f1239}
ul{margin:0;padding-left:20px}
.muted{color:var(--muted)}.small{font-size:12px;margin-top:16px}
.md{font-size:14px;overflow-wrap:anywhere}
.md h1,.md h2,.md h3{font-size:16px;margin:18px 0 6px}
.md table{border-collapse:collapse;display:block;overflow:auto;font-size:12px}
.md td,.md th{border:1px solid var(--line);padding:4px 6px}
.more{margin-top:16px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
@media (max-width:860px){.cols{grid-template-columns:1fr}.facts{grid-template-columns:1fr 1fr}.col.base{max-height:none}}
</style></head>
<body><div class="wrap">
<h1>全文を読むAI分析 vs そのままAIに渡した場合</h1>
<p class="intro">同じ2つの決算短信の全文を、同じモデル（${esc(protos[0]?.model ?? "")}）に読ませた比較。左は DeltaLens 試作で、全文に加えて機械的な差分リスト・過去8期の記載履歴・同業他社の変化を渡し、根拠は閉じて表示。右は全文と「前回と今回の差分を詳細分析して」だけを渡した結果。</p>
<nav>${protos.map((p) => `<a href="#c${p.company.code}">${esc(p.company.name)}</a>`).join("")}</nav>
${totalDeep > 0 ? `<p class="totals">AI費用の合計：DeltaLens 試作 ${yen(totalDeep)}／そのまま渡した場合 ${yen(totalBase)}（1ドル${YEN}円）</p>` : ""}
${protos.map(companyHtml).join("\n")}
</div>
</body></html>`;

writeFileSync(join(PROTO_DIR, "compare.html"), html);
console.log(`wrote ${join(PROTO_DIR, "compare.html")} (${protos.length} companies)`);

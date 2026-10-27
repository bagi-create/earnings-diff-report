"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChangeMeta, EvidenceLinks, KIND_LABEL, Redline, ToneRuler } from "@/components/parts";
import { toMarkdownReport } from "@/lib/report";
import type { AnalysisResult, Change, EvidencePoint, SummarizeResponse } from "@/lib/types";

export type AiState = { status: "loading" } | ({ status: "done" } & SummarizeResponse);

type KindFilter = "text" | Change["kind"];

const USD_JPY = 150;

export default function ResultView(props: {
  result: AnalysisResult;
  ai: AiState | null;
  companyName: string;
}) {
  const { result, ai, companyName } = props;
  const byId = useMemo(() => new Map(result.changes.map((c) => [c.id, c])), [result]);

  const [kind, setKind] = useState<KindFilter>("text");
  const [section, setSection] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [split, setSplit] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const explorerRef = useRef<HTMLElement>(null);

  const aiSummary = ai?.status === "done" ? ai.aiSummary : undefined;
  const reportResult = useMemo(() => ({ ...result, aiSummary }), [result, aiSummary]);

  const visible = useMemo(() => {
    const q = query.trim();
    return result.changes.filter((c) => {
      if (kind === "text" ? c.kind === "numeric" : c.kind !== kind) return false;
      if (section && c.section !== section) return false;
      if (category && !c.categories.includes(category)) return false;
      if (q && !`${c.before ?? ""}${c.after ?? ""}`.includes(q)) return false;
      return true;
    });
  }, [result, kind, section, category, query]);

  const grouped = useMemo(() => {
    const groups: Array<{ section: string; items: Change[] }> = [];
    for (const c of visible) {
      const last = groups[groups.length - 1];
      if (last && last.section === c.section) last.items.push(c);
      else groups.push({ section: c.section, items: [c] });
    }
    return groups;
  }, [visible]);

  function jumpTo(id: string) {
    const change = byId.get(id);
    if (!change) return;
    setKind(change.kind === "numeric" ? "numeric" : "text");
    setSection("");
    setCategory("");
    setQuery("");
    setFocusId(id);
  }

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`change-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setFocusId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focusId]);

  function filterByCategory(name: string) {
    setKind("text");
    setSection("");
    setCategory((current) => (current === name ? "" : name));
    explorerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function filterBySection(name: string) {
    setKind("text");
    setCategory("");
    setSection((current) => (current === name ? "" : name));
    explorerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(toMarkdownReport(reportResult, companyName));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadMarkdown() {
    const blob = new Blob([toMarkdownReport(reportResult, companyName)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${companyName || "決算差分レポート"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const changedSignals = result.signals.filter((s) => s.changed);
  const ruleHeadline = changedSignals.length
    ? changedSignals.map((s) => `${s.label}は${s.after}`).join("、") + "。"
    : result.previousTone.label === result.currentTone.label
      ? `トーンは「${result.currentTone.label}」のまま。`
      : `トーンは「${result.previousTone.label}」から「${result.currentTone.label}」へ。`;
  const maxSection = Math.max(1, ...result.sections.map((s) => s.added + s.removed + s.rephrased + s.unchanged));

  return (
    <div className="results">
      <header className="verdict">
        <div className="verdict__top">
          <p className="eyebrow">{companyName || "比較結果"}</p>
          <div className="toolbar">
            <button type="button" className="btn btn--ghost" onClick={() => void copyMarkdown()}>
              {copied ? "コピーしました" : "Markdownをコピー"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={downloadMarkdown}>
              .mdで保存
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
              印刷・PDF
            </button>
          </div>
        </div>
        <h2 className="verdict__headline">{aiSummary?.headline ?? ruleHeadline}</h2>
        <ToneRuler previous={result.previousTone} current={result.currentTone} />
        <ul className="signals">
          {result.signals
            .filter((s) => s.changed || s.after !== "記載なし")
            .map((s) => (
              <li key={s.key} className={`signal ${s.changed ? "is-changed" : ""} dir-${s.direction}`}>
                <span className="signal__label">{s.label}</span>
                {s.changed ? (
                  <span>
                    <s>{s.before}</s> → <strong>{s.after}</strong>
                  </span>
                ) : (
                  <span>{s.after}（変化なし）</span>
                )}
              </li>
            ))}
        </ul>
      </header>

      <div className="layout">
        <div className="layout__main">
          <AiPanel ai={ai} onJump={jumpTo} />

          <section className="block">
            <h3 className="block__title">自動解析の要点</h3>
            <ul className="bullets">
              {result.summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="block">
            <h3 className="block__title">注目の変化</h3>
            <p className="block__note">重要度の高い順。開示シグナル・見通し・トーンの動きを重く評価しています。</p>
            <ol className="highlights">
              {result.highlights.slice(0, 6).map((id) => {
                const c = byId.get(id)!;
                return (
                  <li key={id} className="change change--card">
                    <ChangeMeta change={c} />
                    <Redline change={c} />
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="block" ref={explorerRef} id="explorer">
            <div className="block__head">
              <h3 className="block__title">すべての変更</h3>
              <label className="toggle">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                前回・今回を並べる
              </label>
            </div>
            <div className="tabs" role="tablist">
              {(["text", "added", "removed", "rephrased", "numeric"] as KindFilter[]).map((k) => {
                const count =
                  k === "text"
                    ? result.changes.length - result.counts.numeric
                    : result.counts[k as Change["kind"]];
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={kind === k}
                    className={`tab ${kind === k ? "is-active" : ""}`}
                    onClick={() => setKind(k)}
                  >
                    {k === "text" ? "文言の変化" : k === "numeric" ? "数値だけの更新" : KIND_LABEL[k as Change["kind"]]}
                    <span className="mono tab__count">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="filters">
              <input
                type="search"
                className="input"
                placeholder="語句で絞り込む（例：為替）"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">すべての区分</option>
                {result.sections.map((s) => (
                  <option key={s.section} value={s.section}>
                    {s.section}
                  </option>
                ))}
              </select>
              {category ? (
                <button type="button" className="chip is-active" onClick={() => setCategory("")}>
                  論点：{category} ×
                </button>
              ) : null}
            </div>

            {grouped.length === 0 ? (
              <p className="empty">条件に合う変更はありません。絞り込みを外すと全件を表示します。</p>
            ) : (
              grouped.map((group, gi) => (
                <div key={`${group.section}-${gi}`} className="group">
                  <h4 className="group__title">{group.section}</h4>
                  <ul className="changes">
                    {group.items.map((c) => (
                      <li key={c.id} id={`change-${c.id}`} className={`change ${focusId === c.id ? "is-focus" : ""}`}>
                        <ChangeMeta change={c} />
                        <Redline change={c} split={split} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="layout__side">
          {result.metrics.length ? (
            <section className="panel">
              <h3 className="panel__title">本文中の主要数値</h3>
              <table className="metrics">
                <thead>
                  <tr>
                    <th />
                    <th>前回</th>
                    <th>今回</th>
                  </tr>
                </thead>
                <tbody>
                  {result.metrics.map((m) => (
                    <tr key={m.name}>
                      <th>{m.name}</th>
                      <td className="mono">
                        {m.before ?? "—"}
                        {m.beforeYoY ? <small>{m.beforeYoY}</small> : null}
                      </td>
                      <td className="mono">
                        {m.after ?? "—"}
                        {m.afterYoY ? <small>{m.afterYoY}</small> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="panel__note">文章中の記載から自動で拾った参考値です。表の数値は対象外です。</p>
            </section>
          ) : null}

          <section className="panel">
            <h3 className="panel__title">区分ごとの書き換え</h3>
            <ul className="sections">
              {result.sections.map((s) => {
                const total = s.added + s.removed + s.rephrased + s.unchanged;
                const pct = (n: number) => `${(n / maxSection) * 100}%`;
                return (
                  <li key={s.section}>
                    <button
                      type="button"
                      className={`sections__row ${section === s.section ? "is-active" : ""}`}
                      onClick={() => filterBySection(s.section)}
                    >
                      <span className="sections__name">{s.section}</span>
                      <span className="sections__bar" aria-hidden>
                        <i className="is-added" style={{ width: pct(s.added) }} />
                        <i className="is-rephrased" style={{ width: pct(s.rephrased) }} />
                        <i className="is-removed" style={{ width: pct(s.removed) }} />
                        <i className="is-same" style={{ width: pct(s.unchanged) }} />
                      </span>
                      <span className="mono sections__count">
                        {s.added + s.rephrased + s.removed}/{total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="legend">
              <span><i className="is-added" />追加</span>
              <span><i className="is-rephrased" />言い換え</span>
              <span><i className="is-removed" />削除</span>
              <span><i className="is-same" />変化なし</span>
            </p>
          </section>

          {result.categories.length ? (
            <section className="panel">
              <h3 className="panel__title">論点</h3>
              <ul className="topics">
                {result.categories.map((c) => (
                  <li key={c.category}>
                    <button
                      type="button"
                      className={`chip ${category === c.category ? "is-active" : ""}`}
                      onClick={() => filterByCategory(c.category)}
                    >
                      {c.category}
                      <span className="mono">{c.changeIds.length}</span>
                      {Math.abs(c.toneDelta) >= 2 ? (
                        <span className={c.toneDelta > 0 ? "is-up" : "is-down"}>{c.toneDelta > 0 ? "▲" : "▼"}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="panel__note">▲は強気寄り、▼は慎重寄りの書き換えが多い論点です。</p>
            </section>
          ) : null}

          <section className="panel">
            <h3 className="panel__title">読み取った資料</h3>
            <dl className="docstats">
              <dt>前回</dt>
              <dd>
                {result.previous.sentences}文・{result.previous.characters.toLocaleString()}字
              </dd>
              <dt>今回</dt>
              <dd>
                {result.current.sentences}文・{result.current.characters.toLocaleString()}字
              </dd>
              <dt>変化なし</dt>
              <dd>{result.unchangedCount}文</dd>
            </dl>
            {result.previous.skippedLines + result.current.skippedLines > 0 ? (
              <p className="panel__note">
                表の行・ページ番号・繰り返しヘッダーの{result.previous.skippedLines + result.current.skippedLines}
                行は比較から除いています。
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function AiPanel({ ai, onJump }: { ai: AiState | null; onJump: (id: string) => void }) {
  if (!ai) return null;
  if (ai.status === "loading") {
    return (
      <section className="block ai is-loading" aria-busy="true">
        <h3 className="block__title">AI要約</h3>
        <p className="block__note">変更点をもとに要約を作成しています…</p>
        <div className="shimmer" />
        <div className="shimmer is-short" />
        <div className="shimmer" />
      </section>
    );
  }
  if (!ai.aiSummary) {
    const message =
      ai.aiStatus === "not_configured"
        ? "AI要約は設定されていません（GEMINI_API_KEY）。自動解析の結果のみ表示しています。"
        : (ai.warning ?? "AI要約は利用できませんでした。自動解析の結果のみ表示しています。");
    return <p className="notice">{message}</p>;
  }
  const s = ai.aiSummary;
  return (
    <section className="block ai">
      <h3 className="block__title">AI要約</h3>
      <p className="ai__overview">{s.overview}</p>
      <p className="ai__tone">
        <span className="ai__toneLabel">{s.toneDirection}</span>
        {s.toneReason}
        <EvidenceLinks ids={s.toneEvidence} onJump={onJump} />
      </p>
      <PointList title="重要な変化" points={s.keyPoints} onJump={onJump} />
      <div className="ai__pair">
        <PointList title="次に確認したい点" points={s.watchPoints} onJump={onJump} />
        <PointList title="リスク・不確実性" points={s.risks} onJump={onJump} />
      </div>
      <p className="ai__foot">
        {ai.model}
        {ai.aiStatus === "cached" ? "・保存済みの要約" : ""}
        {ai.usage
          ? `・入力${ai.usage.inputTokens.toLocaleString()}／出力${ai.usage.outputTokens.toLocaleString()}トークン・約${(ai.usage.estimatedUsd * USD_JPY).toFixed(2)}円`
          : ""}
        ・番号をクリックすると根拠の文へ移動します
      </p>
    </section>
  );
}

function PointList({
  title,
  points,
  onJump,
}: {
  title: string;
  points: EvidencePoint[];
  onJump: (id: string) => void;
}) {
  if (!points.length) return null;
  return (
    <div className="points">
      <h4 className="points__title">{title}</h4>
      <ul>
        {points.map((p) => (
          <li key={p.title + p.detail}>
            <strong>{p.title}</strong>
            <span>{p.detail}</span>
            <EvidenceLinks ids={p.evidence} onJump={onJump} />
          </li>
        ))}
      </ul>
    </div>
  );
}

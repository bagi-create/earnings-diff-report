"use client";

import type { Change, ToneSummary } from "@/lib/types";

export const KIND_LABEL: Record<Change["kind"], string> = {
  added: "追加",
  removed: "削除",
  rephrased: "言い換え",
  numeric: "数値更新",
};

const TONE_ZONES = ["慎重", "やや慎重", "中立", "やや強気", "強気"];

/** Position on the ruler: score -100..100 → 0..100%. */
const at = (score: number) => `${Math.min(100, Math.max(0, (score + 100) / 2))}%`;

export function ToneRuler({ previous, current }: { previous: ToneSummary; current: ToneSummary }) {
  const shift = current.score - previous.score;
  const left = Math.min(previous.score, current.score);
  const width = Math.abs(shift) / 2;
  return (
    <figure className="ruler" aria-label={`トーン ${previous.label}から${current.label}へ`}>
      <div className="ruler__track">
        <span className="ruler__line" />
        {[20, 40, 60, 80].map((x) => (
          <span key={x} className="ruler__tick" style={{ left: `${x}%` }} />
        ))}
        <span
          className={`ruler__move ${shift >= 0 ? "is-up" : "is-down"}`}
          style={{ left: at(left), width: `${width}%` }}
        />
        <span className="ruler__mark is-before" style={{ left: at(previous.score) }}>
          <span>前回</span>
        </span>
        <span className="ruler__mark is-after" style={{ left: at(current.score) }}>
          <span>今回</span>
        </span>
      </div>
      <div className="ruler__zones" aria-hidden>
        {TONE_ZONES.map((zone) => (
          <span key={zone}>{zone}</span>
        ))}
      </div>
      <figcaption className="ruler__caption">
        <span>
          前回 {previous.label} <b className="mono">{signed(previous.score)}</b>
        </span>
        <span aria-hidden>→</span>
        <span>
          今回 <strong>{current.label}</strong> <b className="mono">{signed(current.score)}</b>
        </span>
        <span className={`ruler__delta mono ${shift > 0 ? "is-up" : shift < 0 ? "is-down" : ""}`}>
          {shift === 0 ? "±0" : signed(shift)}
        </span>
      </figcaption>
    </figure>
  );
}

/** Signal states that only say a topic is mentioned; a change to them is not news. */
const UNINFORMATIVE = new Set(["言及あり", "記載なし"]);
export const isMeaningfulSignal = (s: { changed?: boolean; after: string }) =>
  s.changed !== false && !UNINFORMATIVE.has(s.after);

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * The proof-sheet rendering of a change: deleted words struck through in
 * vermilion, inserted words underlined in ultramarine, like a 校正紙.
 */
export function Redline({ change, split }: { change: Change; split?: boolean }) {
  if (split && change.before && change.after && change.inline) {
    return (
      <div className="split">
        <p className="split__side">
          <span className="split__label">前回</span>
          {change.inline
            .filter((s) => s.op !== "add")
            .map((s, i) => (s.op === "del" ? <del key={i}>{s.text}</del> : <span key={i}>{s.text}</span>))}
        </p>
        <p className="split__side">
          <span className="split__label">今回</span>
          {change.inline
            .filter((s) => s.op !== "del")
            .map((s, i) => (s.op === "add" ? <ins key={i}>{s.text}</ins> : <span key={i}>{s.text}</span>))}
        </p>
      </div>
    );
  }
  if (change.inline) {
    return (
      <p className="redline">
        {change.inline.map((s, i) =>
          s.op === "eq" ? <span key={i}>{s.text}</span> : s.op === "del" ? <del key={i}>{s.text}</del> : <ins key={i}>{s.text}</ins>,
        )}
      </p>
    );
  }
  return (
    <p className="redline">
      {change.after ? <ins className="is-whole">{change.after}</ins> : <del className="is-whole">{change.before}</del>}
    </p>
  );
}

export function ChangeMeta({ change }: { change: Change }) {
  return (
    <div className="meta">
      <span className="mono meta__id">{change.id}</span>
      <span className={`kind kind--${change.kind}`}>{KIND_LABEL[change.kind]}</span>
      <span className="meta__section">{change.section}</span>
      {change.categories.slice(0, 3).map((c) => (
        <span key={c} className="meta__tag">
          {c}
        </span>
      ))}
      {Math.abs(change.toneDelta) >= 1 ? (
        <span className={`meta__tone ${change.toneDelta > 0 ? "is-up" : "is-down"}`}>
          {change.toneDelta > 0 ? "強気寄り" : "慎重寄り"}
        </span>
      ) : null}
    </div>
  );
}

export function EvidenceLinks({ ids, onJump }: { ids: string[]; onJump: (id: string) => void }) {
  if (!ids.length) return null;
  return (
    <span className="evidence">
      {ids.map((id) => (
        <button key={id} type="button" className="evidence__chip mono" onClick={() => onJump(id)} title="根拠の文へ移動">
          {id}
        </button>
      ))}
    </span>
  );
}

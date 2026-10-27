import type { InlineSegment } from "@/lib/types";

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("ja", { granularity: "word" })
    : null;

function tokenize(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/**
 * Word-level diff of two sentences (LCS). Sentences are short, so the
 * quadratic table is cheap; very long inputs fall back to a whole replace.
 */
export function inlineDiff(before: string, after: string): InlineSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > 250_000) {
    return [
      { op: "del", text: before },
      { op: "add", text: after },
    ];
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  const out: InlineSegment[] = [];
  const push = (op: InlineSegment["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("eq", a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      push("del", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return cleanup(out, before, after);
}

/**
 * Make the diff readable: tiny matches stranded between edits ("を", "え")
 * are folded into the surrounding replacement, each replacement shows the
 * deletion before the insertion, and a sentence that was mostly rewritten
 * is shown as one deletion plus one insertion.
 */
function cleanup(segments: InlineSegment[], before: string, after: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let del = "";
  let add = "";
  const flush = () => {
    if (del) out.push({ op: "del", text: del });
    if (add) out.push({ op: "add", text: add });
    del = "";
    add = "";
  };
  segments.forEach((seg, k) => {
    const stranded =
      seg.op === "eq" &&
      seg.text.length <= 2 &&
      k > 0 &&
      k < segments.length - 1 &&
      segments[k - 1].op !== "eq" &&
      segments[k + 1].op !== "eq";
    if (seg.op === "del") del += seg.text;
    else if (seg.op === "add") add += seg.text;
    else if (stranded) {
      del += seg.text;
      add += seg.text;
    } else {
      flush();
      out.push(seg);
    }
  });
  flush();

  const kept = out.filter((s) => s.op === "eq").reduce((n, s) => n + s.text.length, 0);
  if (kept / Math.max(before.length, after.length) < 0.35) {
    return [
      { op: "del", text: before },
      { op: "add", text: after },
    ];
  }
  return out;
}

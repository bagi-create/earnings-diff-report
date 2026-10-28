import type { Metadata } from "next";
import Link from "next/link";
import { bigrams, matchDocument, parseQuery, shardOf, type DocMatch, type IndexShard } from "@/lib/docSearch";
import { DOCS_KEY, docTextKey, indexShardKey, type DocMeta, type ReportDocType } from "@/lib/reportTypes";
import { readReport } from "@/lib/reportsStore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "決算資料を言葉で探す" };

const EXAMPLES = ["生成AI", "データセンタ", "中東", "関税", "金利", "人手不足", "価格転嫁", "減損"];
const TYPE_LABEL: Record<ReportDocType, string> = { tanshin: "決算短信", presentation: "決算説明資料" };
const PRESETS: Array<[label: string, days: number | null]> = [
  ["1か月", 31],
  ["3か月", 92],
  ["半年", 183],
  ["1年", 366],
  ["すべて", null],
];
const PAGE_SIZE = 20;

/** Today in Japan as YYYY-MM-DD. */
const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const daysBefore = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() - days * 86400_000).toISOString().slice(0, 10);
const isDate = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

type Props = { searchParams: Promise<{ q?: string; from?: string; to?: string; type?: string; page?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 60);
  const today = todayJst();
  const to = isDate(params.to) ? params.to! : today;
  const from = params.from === "all" ? "" : isDate(params.from) ? params.from! : daysBefore(to, 92);
  const type = params.type === "tanshin" || params.type === "presentation" ? params.type : undefined;
  const terms = parseQuery(q);

  const page = Math.max(1, Math.min(50, Number(params.page) || 1));
  const tooShort = terms.some((t) => t.length < 2);

  const rawList = await readReport(DOCS_KEY);
  const docs = rawList ? (JSON.parse(rawList) as DocMeta[]) : null;
  const inRange = (d: DocMeta) =>
    (!type || d.type === type) && (from ? Boolean(d.date) && d.date! >= from : true) && (!d.date || d.date <= to);
  const rangeSize = (docs ?? []).filter(inRange).length;

  // 1. The index narrows the documents to those containing every 2-character piece of the keywords.
  //    The list is sorted newest first, so candidate positions come out newest first too.
  let candidates: DocMeta[] = [];
  if (docs && terms.length && !tooShort) {
    const grams = [...new Set(terms.flatMap((t) => [...bigrams(t)]))];
    const shardIds = [...new Set(grams.map(shardOf))];
    const shards = await Promise.all(shardIds.map((s) => readReport(indexShardKey(s))));
    const byShard = new Map(shardIds.map((s, i) => [s, shards[i] ? (JSON.parse(shards[i]!) as IndexShard) : {}]));
    const lists = grams
      .map((g) => byShard.get(shardOf(g))?.[g] ?? [])
      .sort((a, b) => a.length - b.length);
    let positions = lists[0] ?? [];
    for (const list of lists.slice(1)) {
      const set = new Set(list);
      positions = positions.filter((p) => set.has(p));
    }
    candidates = positions.map((p) => docs[p]).filter((d) => d && inRange(d));
  }

  // 2. Only the documents on this page are read, to confirm the exact phrase and cut excerpts.
  const shown = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const texts = await Promise.all(shown.map((d) => readReport(docTextKey(d.id))));
  const results: Array<{ doc: DocMeta; match: DocMatch }> = [];
  shown.forEach((doc, i) => {
    const match = texts[i] ? matchDocument(texts[i]!, terms) : null;
    if (match) results.push({ doc, match });
  });
  const total = candidates.length;
  const companies = new Set(candidates.map((d) => d.code)).size;
  // A 2-character keyword is matched exactly by the index; longer ones can rarely over-match.
  const approximate = terms.some((t) => t.length > 2);
  const pages = Math.ceil(total / PAGE_SIZE);

  const href = (next: Partial<Record<"q" | "from" | "to" | "type" | "page", string>>) => {
    const p = new URLSearchParams();
    const merged = { q, from: params.from === "all" ? "all" : from, to, type: type ?? "", ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/search?${p.toString()}`;
  };

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-10 sm:px-5">
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">Full-text search</p>
      <h1 className="m-0 mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">決算資料を言葉で探す</h1>
      <p className="m-0 mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
        開示日の期間とキーワードを指定すると、その言葉が出てくる決算短信・説明資料と、前後の文章を一覧にします。原文のPDFへのリンクから、そのまま確かめられます。
      </p>

      <form action="/search" method="get" className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
        <label>
          <span className="mb-1.5 block text-xs text-zinc-400">キーワード（空白で区切ると、すべてを含む資料）</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="例：生成AI、中東、価格転嫁"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-base text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs text-zinc-400">開示日（から）</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 [color-scheme:dark]"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs text-zinc-400">（まで）</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 [color-scheme:dark]"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs text-zinc-400">資料</span>
          <select
            name="type"
            defaultValue={type ?? ""}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100"
          >
            <option value="">両方</option>
            <option value="tanshin">決算短信</option>
            <option value="presentation">決算説明資料</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border-0 bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-950! transition-colors hover:bg-emerald-300"
        >
          探す
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-500">期間：</span>
          {PRESETS.map(([label, days]) => (
            <Link
              key={label}
              href={href({ from: days === null ? "all" : daysBefore(today, days), to: today })}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300 no-underline hover:border-zinc-600"
            >
              直近{label === "すべて" ? "すべて" : label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-500">例：</span>
          {EXAMPLES.map((e) => (
            <Link
              key={e}
              href={href({ q: e })}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300 no-underline hover:border-zinc-600"
            >
              {e}
            </Link>
          ))}
        </div>
      </div>

      {!docs ? (
        <p className="mt-10 text-sm text-zinc-400">検索用のデータを準備中です。</p>
      ) : terms.length === 0 ? null : tooShort ? (
        <p className="mt-10 text-sm text-zinc-400">キーワードは2文字以上で入力してください。</p>
      ) : (
        <section className="mt-10" aria-live="polite">
          <p className="m-0 border-b border-zinc-800 pb-3 text-sm text-zinc-300">
            「{q}」：{from ? `${from} 〜 ${to}` : `${to} まで`}に開示された{rangeSize}本のうち、
            <span className="font-semibold text-zinc-50">
              {approximate ? "約" : ""}
              {total}本（{companies}社）
            </span>
            に出てきます
            {pages > 1 ? `（新しい順・${page}/${pages}ページ）` : ""}
          </p>
          {results.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-400">
              該当する資料はありませんでした。期間を広げるか、別の言い方で試してください。
            </p>
          ) : (
            <ol className="m-0 mt-4 grid list-none gap-3 p-0">
              {results.map(({ doc, match }) => (
                <li key={doc.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-zinc-500">{doc.date ?? "日付不明"}</span>
                      <Link
                        href={`/company/${doc.code}`}
                        className="ml-3 text-base font-semibold text-zinc-50 no-underline hover:text-emerald-300"
                      >
                        {doc.name}
                      </Link>
                      <span className="ml-2 text-xs text-zinc-500">
                        {TYPE_LABEL[doc.type]}・{doc.official}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400">
                      「{terms[0]}」{match.count}回
                    </span>
                  </div>
                  <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                    {match.excerpts.map((e, i) => (
                      <li
                        key={i}
                        className="border-l-2 border-zinc-700 pl-3 text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]"
                      >
                        {e.parts.map((p, k) =>
                          p.mark ? (
                            <mark key={k} className="rounded-sm bg-emerald-400/25 px-0.5 text-emerald-100">
                              {p.text}
                            </mark>
                          ) : (
                            <span key={k}>{p.text}</span>
                          ),
                        )}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-xs text-emerald-400 no-underline hover:text-emerald-300"
                  >
                    原文のPDFを開く{doc.title ? `（${doc.title}）` : ""} ↗
                  </a>
                </li>
              ))}
            </ol>
          )}
          {pages > 1 ? (
            <nav aria-label="ページ" className="mt-6 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={href({ page: String(page - 1) })} className="text-emerald-400 no-underline hover:text-emerald-300">
                  ← 新しい資料
                </Link>
              ) : (
                <span />
              )}
              {page < pages ? (
                <Link href={href({ page: String(page + 1) })} className="text-emerald-400 no-underline hover:text-emerald-300">
                  古い資料 →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      )}

      <p className="m-0 mt-12 text-xs leading-relaxed text-zinc-500">
        対象は TOPIX Core30 の決算短信と決算説明資料（2023年7月以降の約750本）です。PDFから取り出した文章を探すため、表の中の語や画像の文字は見つからないことがあります。DeltaLens は特定の銘柄の売買を勧めるものではありません。
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import CompanyView from "@/components/CompanyView";
import { findCompany } from "@/lib/companies";
import { companyKey, type CompanyIndex } from "@/lib/reportTypes";
import { readReport } from "@/lib/reportsStore";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const company = findCompany((await params).code);
  return { title: company ? `${company.name}（${company.code}）` : "銘柄が見つかりません" };
}

export default async function CompanyPage({ params }: Params) {
  const { code } = await params;
  const company = findCompany(code);
  const raw = company?.covered ? await readReport(companyKey(company.code)) : null;
  const index = raw ? (JSON.parse(raw) as CompanyIndex) : null;

  if (!company || !index || index.periods.length === 0) {
    return (
      <main className="page">
        <header className="company__head">
          {company ? <p className="mono eyebrow">{company.code}・{company.sector}</p> : null}
          <h1 className="company__name">{company?.name ?? `コード ${code}`}</h1>
        </header>
        <p className="notice">
          {company
            ? "この銘柄のレポートはまだ準備中です。試作版では TOPIX Core30 の30社だけを用意しています。"
            : "このコードの上場銘柄は見つかりませんでした。"}
          手元の資料があれば、
          <Link href="/compare" className="link">
            自分の資料で比べる
          </Link>
          から読み比べられます。
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <CompanyView key={index.code} index={index} sector={company.sector} market={company.market} />
    </main>
  );
}

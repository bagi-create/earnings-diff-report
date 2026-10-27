import Link from "next/link";
import CompanySearch from "@/components/CompanySearch";
import { CORE30 } from "@/data/core30";
import { findCompany } from "@/lib/companies";

export default function Page() {
  return (
    <main className="page home">
      <section className="home__lead">
        <h1 className="home__title">決算のたびに、何が書き換わったか。</h1>
        <p className="home__sub">
          決算短信と決算説明資料を、前の四半期・前年の同じ四半期と読み比べた結果を、銘柄ごとに8期分用意しています。
        </p>
        <CompanySearch />
      </section>

      <section className="block">
        <div className="block__head">
          <h2 className="block__title">TOPIX Core30</h2>
          <p className="block__note">試作版として、この30社のレポートを用意しています（2026年10月30日の入替後の構成）。</p>
        </div>
        <ul className="core30">
          {CORE30.map((c) => (
            <li key={c.code}>
              <Link href={`/company/${c.code}`} className="core30__item">
                <span className="mono core30__code">{c.code}</span>
                <span className="core30__name">{c.name}</span>
                <span className="core30__sector">{findCompany(c.code)?.sector}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="block home__compare">
        <h2 className="block__title">手元の資料で比べる</h2>
        <p>
          ほかの銘柄や、ここにない資料は、PDFをアップロードして読み比べられます。
          <Link href="/compare" className="link">
            自分の資料で比べる
          </Link>
        </p>
      </section>

      <footer className="footer">
        決算資料の文言の変化を機械的に整理するツールです。特定の銘柄の売買を勧めるものではありません。
      </footer>
    </main>
  );
}

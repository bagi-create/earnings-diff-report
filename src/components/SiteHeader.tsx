"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const path = usePathname();
  const onCompare = path.startsWith("/compare");
  return (
    <header className="masthead">
      <Link href="/" className="masthead__mark">
        決算差分
      </Link>
      <nav className="masthead__nav" aria-label="メニュー">
        <Link href="/" aria-current={!onCompare ? "page" : undefined}>
          銘柄から探す
        </Link>
        <Link href="/compare" aria-current={onCompare ? "page" : undefined}>
          自分の資料で比べる
        </Link>
      </nav>
    </header>
  );
}

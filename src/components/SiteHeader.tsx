"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";

const NAV = [
  { href: "/", label: "銘柄から探す", match: (p: string) => !p.startsWith("/compare") },
  { href: "/compare", label: "自分の資料で比べる", match: (p: string) => p.startsWith("/compare") },
];

export default function SiteHeader() {
  const path = usePathname();
  return (
    <header className="site-header sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5 text-zinc-100 no-underline" aria-label="DeltaLens ホーム">
          <BrandMark className="h-7 w-7 text-emerald-400" />
          <span className="text-[17px] font-semibold tracking-tight">
            Delta<span className="text-emerald-400">Lens</span>
          </span>
        </Link>
        <nav aria-label="メインメニュー" className="flex items-center gap-0.5 text-xs sm:gap-1 sm:text-[13px]">
          {NAV.map((item) => {
            const active = item.match(path);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 no-underline sm:px-3 transition-colors ${
                  active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

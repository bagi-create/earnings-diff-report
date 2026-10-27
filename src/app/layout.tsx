import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "決算差分レポート",
  description:
    "前回と今回の決算資料を読み比べ、書き加えられた記述・消えた記述・言い回しの変化、トーンと開示シグナルの変化を整理します。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+JP:wght@400;500;700&family=Shippori+Mincho:wght@600;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

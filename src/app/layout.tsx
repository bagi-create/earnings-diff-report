import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "決算差分レポート",
  description:
    "前回と今回の決算資料を比較し、文言の追加・削除・言い換え、トーン変化、事業環境の変化を整理します。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

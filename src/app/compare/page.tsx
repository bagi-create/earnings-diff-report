import type { Metadata } from "next";
import EarningsDiffApp from "@/components/EarningsDiffApp";

export const metadata: Metadata = { title: "自分の資料で比べる" };

export default function ComparePage() {
  return <EarningsDiffApp />;
}

/** DeltaLens のロゴマーク：レンズ（円）越しに見る Δ。 */
export default function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M16 8.5 L24 22.5 H8 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M16 14 L19.6 20.3 H12.4 Z" fill="currentColor" fillOpacity="0.9" />
    </svg>
  );
}

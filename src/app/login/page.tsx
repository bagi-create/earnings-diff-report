import type { Metadata } from "next";
import { safeNext } from "@/lib/prototypeAuth";

export const metadata: Metadata = { title: "パスワード" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="page">
      <form className="login" method="post" action="/api/login">
        <h1 className="login__title">試作版のレポート</h1>
        <p className="login__note">銘柄ごとのレポートは、いまは関係者だけに公開しています。共有されたパスワードを入力してください。</p>
        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="login__field">
          <span>パスワード</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {error === "1" ? <p className="login__error">パスワードが違います。</p> : null}
        {error === "closed" ? <p className="login__error">レポートは現在公開を停止しています。</p> : null}
        <button type="submit" className="btn btn--primary">
          レポートを開く
        </button>
      </form>
    </main>
  );
}

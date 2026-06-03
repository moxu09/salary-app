"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [message, setMessage] = useState("正在確認 Discord 登入狀態...");
  const [debug, setDebug] = useState("");

  useEffect(() => {
    async function handleCallback() {
      try {
        const href = window.location.href;
        const hash = window.location.hash || "";

        const code = searchParams.get("code");
        const urlError = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        setDebug(
          JSON.stringify(
            {
              href,
              hash,
              hasCode: Boolean(code),
              codeStart: code ? code.slice(0, 8) : null,
              urlError,
              errorDescription,
            },
            null,
            2
          )
        );

        if (urlError) {
          setMessage(`Discord / Supabase 回傳錯誤：${errorDescription || urlError}`);
          return;
        }

        // 先看是不是 Supabase 已經自己存好 session
        const firstSession = await supabase.auth.getSession();

        if (firstSession.data.session?.user) {
          setMessage("登入成功，正在前往員工中心...");
          setTimeout(() => router.replace("/staff"), 500);
          return;
        }

        // PKCE：網址會有 ?code=
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            setMessage(`交換 session 失敗：${exchangeError.message}`);
            setDebug((prev) =>
              `${prev}\n\nexchangeError:\n${JSON.stringify(exchangeError, null, 2)}`
            );
            return;
          }

          const afterExchange = await supabase.auth.getSession();

          if (afterExchange.data.session?.user) {
            setMessage("登入成功，正在前往員工中心...");
            setTimeout(() => router.replace("/staff"), 500);
            return;
          }

          setMessage("已交換 code，但仍讀不到 session。");
          setDebug((prev) =>
            `${prev}\n\nafterExchange:\n${JSON.stringify(afterExchange, null, 2)}`
          );
          return;
        }

        // Implicit flow：網址可能是 #access_token=...
        if (hash.includes("access_token")) {
          const params = new URLSearchParams(hash.replace(/^#/, ""));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");

          if (access_token && refresh_token) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (setSessionError) {
              setMessage(`寫入 session 失敗：${setSessionError.message}`);
              setDebug((prev) =>
                `${prev}\n\nsetSessionError:\n${JSON.stringify(setSessionError, null, 2)}`
              );
              return;
            }

            setMessage("登入成功，正在前往員工中心...");
            setTimeout(() => router.replace("/staff"), 500);
            return;
          }
        }

        setMessage(
          "錯誤：callback 沒有 code，也沒有 access_token。請檢查 Supabase Redirect URLs 與 lib/supabase.ts 的 flowType。"
        );
      } catch (err: any) {
        setMessage(`callback 發生未知錯誤：${err?.message || String(err)}`);
        setDebug((prev) => `${prev}\n\ncatch:\n${String(err)}`);
      }
    }

    handleCallback();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm text-violet-300">深夜不關燈</p>
        <h1 className="mt-2 text-2xl font-bold">登入驗證中</h1>

        <p className="mt-4 rounded-xl bg-zinc-950 p-4 text-sm text-zinc-200">
          {message}
        </p>

        <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-black p-4 text-xs text-zinc-300">
          {debug}
        </pre>

        <button
          onClick={() => router.replace("/login")}
          className="mt-5 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
        >
          回登入頁
        </button>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-sm text-violet-300">深夜不關燈</p>
            <h1 className="mt-2 text-2xl font-bold">登入驗證中...</h1>
            <p className="mt-3 text-sm text-zinc-400">
              正在載入 Discord 登入資訊
            </p>
          </div>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
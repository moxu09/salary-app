"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("正在確認 Discord 登入狀態...");
  const [debug, setDebug] = useState("");

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        setDebug(
          JSON.stringify(
            {
              href: window.location.href,
              hasCode: Boolean(code),
              codeStart: code ? code.slice(0, 8) : null,
              error,
              errorDescription,
            },
            null,
            2
          )
        );

        if (error) {
          setMessage(`Discord / Supabase 回傳錯誤：${errorDescription || error}`);
          return;
        }

        if (!code) {
          setMessage("錯誤：callback 網址裡沒有 code，代表 OAuth 沒有成功回傳授權碼。");
          return;
        }

        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setMessage(`交換 session 失敗：${exchangeError.message}`);
          setDebug((prev) =>
            `${prev}\n\nexchangeError:\n${JSON.stringify(exchangeError, null, 2)}`
          );
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          setMessage(`已交換 code，但讀不到 session：${sessionError?.message || "no session"}`);
          setDebug((prev) =>
            `${prev}\n\nexchangeData:\n${JSON.stringify(data, null, 2)}\n\nsessionError:\n${JSON.stringify(sessionError, null, 2)}`
          );
          return;
        }

        setMessage("登入成功，正在前往員工中心...");
        setDebug((prev) =>
          `${prev}\n\nuser:\n${JSON.stringify(session.user, null, 2)}`
        );

        setTimeout(() => {
          router.replace("/staff");
        }, 800);
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
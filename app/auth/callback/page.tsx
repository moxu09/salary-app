"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get("code");

        if (!code) {
          console.error("OAuth callback missing code");
          router.replace("/login");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("OAuth callback error:", error);
          router.replace("/login");
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          console.error("Get session after callback error:", sessionError);
          router.replace("/login");
          return;
        }

        router.replace("/staff");
      } catch (error) {
        console.error("Auth callback unexpected error:", error);
        router.replace("/login");
      }
    }

    handleCallback();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-sm text-violet-300">深夜不關燈</p>
        <h1 className="mt-2 text-2xl font-bold">登入驗證中...</h1>
        <p className="mt-3 text-sm text-zinc-400">
          正在確認 Discord 登入狀態，請稍候。
        </p>
      </div>
    </main>
  );
}
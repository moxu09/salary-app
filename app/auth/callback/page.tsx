"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );

        if (error) {
          console.error("OAuth callback error:", error);
          router.replace("/login");
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error("Get user after callback error:", userError);
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
  }, [router]);

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
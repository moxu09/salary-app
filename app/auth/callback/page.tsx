"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      );

      if (error) {
        console.error("OAuth callback error:", error);
        router.replace("/login");
        return;
      }

      router.replace("/staff");
    }

    handleCallback();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-xl font-bold">登入驗證中...</p>
        <p className="mt-2 text-sm text-zinc-400">正在確認 Discord 登入狀態</p>
      </div>
    </main>
  );
}
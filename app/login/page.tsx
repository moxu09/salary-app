"use client";

import { supabase } from "@/lib/supabase";
import { MessageCircle } from "lucide-react";

export default function LoginPage() {
  async function loginWithDiscord() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: "https://salary.wearestilllhere.com/auth/callback",
      },
    });

    if (error) {
      alert("Discord 登入失敗");
      console.error(error);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-sm text-violet-300">深夜不關燈</p>

        <h1 className="mt-2 text-3xl font-bold">員工登入</h1>

        <p className="mt-3 text-sm text-zinc-400">
          使用 Discord 登入後，系統會自動判斷你的員工身份。
        </p>

        <button
          onClick={loginWithDiscord}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
        >
          <MessageCircle size={18} />
          使用 Discord 登入
        </button>
      </div>
    </main>
  );
}
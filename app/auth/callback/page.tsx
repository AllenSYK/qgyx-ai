"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("正在完成邮箱验证。");

  useEffect(() => {
    let cancelled = false;

    async function completeEmailVerification() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
        setMessage("验证链接缺少 code，请重新打开邮件中的链接。");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) {
        return;
      }

      if (error) {
        setMessage("邮箱验证失败，请重新打开邮件中的链接。");
        return;
      }

      setMessage("邮箱验证完成，即将进入首页。");
      window.setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 300);
    }

    void completeEmailVerification();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-2xl font-semibold text-slate-950">
        qgyx.asia
      </Link>
      <section className="w-full rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-card backdrop-blur transition duration-[250ms] ease-out sm:p-8">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">邮箱验证</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      </section>
    </main>
  );
}

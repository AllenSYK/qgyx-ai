"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { ArrowLeft, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";

const CODE_LENGTH = 8;

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const emailFromUrl = searchParams.get("email") || "";
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const code = useMemo(() => digits.join(""), [digits]);

  function getRegisterInfo() {
    const email = sessionStorage.getItem("qgyx_register_email") || emailFromUrl;
    const password = sessionStorage.getItem("qgyx_register_password") || "";
    return { email, password };
  }

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");

    if (clean.length > 1) {
      const next = Array(CODE_LENGTH).fill("");
      clean
        .slice(0, CODE_LENGTH)
        .split("")
        .forEach((char, charIndex) => {
          next[charIndex] = char;
        });

      setDigits(next);
      inputRefs.current[Math.min(clean.length, CODE_LENGTH - 1)]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = clean;
    setDigits(next);

    if (clean && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function verify() {
    setError("");
    setNotice("");

    const { email, password } = getRegisterInfo();

    if (!email || !password) {
      setError("注册信息已失效，请返回注册页重新填写。");
      return;
    }

    if (!/^\d{8}$/.test(code)) {
      setError("请输入完整 8 位验证码。");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify-register-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password, code })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setError(data?.error || "验证码验证失败。");
        return;
      }

      sessionStorage.removeItem("qgyx_register_email");
      sessionStorage.removeItem("qgyx_register_password");

      setNotice("注册成功，即将前往登录页。");
      window.setTimeout(() => router.push("/login?registered=1"), 650);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError("");
    setNotice("");

    const { email, password } = getRegisterInfo();

    if (!email || !password) {
      setError("注册信息已失效，请返回注册页重新填写。");
      return;
    }

    setResending(true);

    try {
      const response = await fetch("/api/auth/send-register-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setError(data?.error || "重新发送失败。");
        return;
      }

      setDigits(Array(CODE_LENGTH).fill(""));
      setNotice("新的验证码已发送，请查看邮箱。");
      inputRefs.current[0]?.focus();
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f2e8] px-4 py-10">
      <div className="absolute left-[-160px] top-[-160px] h-[420px] w-[420px] rounded-full bg-blue-100/70 blur-3xl" />
      <div className="absolute bottom-[-180px] right-[-140px] h-[460px] w-[460px] rounded-full bg-amber-100/80 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 blur-3xl" />

      <section className="relative w-full max-w-xl rounded-[38px] border border-white/70 bg-white/85 p-6 shadow-[0_34px_100px_rgba(105,83,48,0.18)] backdrop-blur-xl sm:p-9">
        <Link href="/register" className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          返回注册
        </Link>

        <div className="text-center">
          <div className="mx-auto mb-5 flex h-18 w-18 items-center justify-center rounded-[28px] bg-gradient-to-br from-blue-50 to-amber-50 p-4 text-blue-600 shadow-inner">
            <MailCheck className="h-9 w-9" />
          </div>

          <div className="text-xs font-bold tracking-[0.32em] text-amber-700">QGYX.ASIA</div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            验证你的邮箱
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-500">
            我们已向{" "}
            <span className="font-semibold text-slate-800">{emailFromUrl || "你的邮箱"}</span>{" "}
            发送 8 位验证码。输入完成后，账号才会正式创建。
          </p>
        </div>

        <div className="mt-8 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              value={digit}
              inputMode="numeric"
              maxLength={1}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              className="h-14 rounded-2xl border border-slate-200 bg-white text-center text-2xl font-semibold text-slate-950 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:h-16"
            />
          ))}
        </div>

        {notice ? (
          <div className="mt-6 flex gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={verify}
          disabled={loading}
          className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 font-semibold text-white shadow-[0_14px_35px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "正在验证..." : "验证并完成注册"}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className="h-4 w-4" />
          {resending ? "正在重新发送..." : "重新发送验证码"}
        </button>

        <p className="mt-6 text-center text-xs leading-6 text-slate-400">
          验证码 10 分钟内有效。若未收到，请检查垃圾邮件或稍后重新发送。
        </p>
      </section>
    </main>
  );
}

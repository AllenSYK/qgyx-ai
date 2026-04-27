import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut, Mail, Package, UserCircle, WalletCards } from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import { ensureProfile, ensureUserCredits, getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function MePage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [credits, profile] = await Promise.all([ensureUserCredits(user, supabase), ensureProfile(user, supabase)]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <UserCircle className="h-4 w-4" />
          我的
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">账号与次数</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              <Mail className="h-4 w-4" />
              账号邮箱
            </div>
            <div className="font-semibold text-slate-950">{user.email}</div>
            <div className="mt-2 text-sm text-slate-500">角色：{profile.role}</div>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-blue-900">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <WalletCards className="h-4 w-4" />
              剩余次数
            </div>
            <div className="text-3xl font-semibold">{credits.remaining}</div>
            <div className="mt-2 text-sm">已购买 {credits.total_purchased} 次</div>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <Package className="h-5 w-5" />
            套餐入口
          </div>
          <p className="text-sm leading-6">支付系统暂未接入。次数不足时请联系管理员手动充值。</p>
        </div>

        <form action={signOut} className="mt-6">
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 sm:w-auto">
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </form>
      </section>

      <MobileBottomNav />
    </main>
  );
}

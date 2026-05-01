import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import RecordsClient from "@/components/RecordsClient";
import type { AnalysisRecordListItem, QuizRecordListItem } from "@/components/RecordsClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: quizData }, { data: analysisData }] = await Promise.all([
    supabase
      .from("quiz_records")
      .select("id,quiz_title,mode,questions,answers,score,wrong_questions,current_index,is_completed,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("analysis_records")
      .select("id,recognized_text,answer,explanation,knowledge_points,common_mistakes,tags,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60)
  ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/" prefetch className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition active:scale-[0.98]">
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-card backdrop-blur sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <ClipboardList className="h-4 w-4" />
          历史记录
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">每次练习和解析都会保存在这里</h1>

        <RecordsClient
          quizRecords={(quizData || []) as QuizRecordListItem[]}
          analysisRecords={(analysisData || []) as AnalysisRecordListItem[]}
        />
      </section>

      <MobileBottomNav />
    </main>
  );
}

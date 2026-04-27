import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import { getCurrentUser } from "@/lib/auth";

type RecordRow = {
  id: string;
  quiz_title: string;
  question_count: number;
  correct_count: number;
  accuracy: number;
  knowledge_points: string[];
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default async function RecordsPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("study_records")
    .select("id,quiz_title,question_count,correct_count,accuracy,knowledge_points,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const records = (data || []) as RecordRow[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <ClipboardList className="h-4 w-4" />
          学习记录
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">每次练习都会保存在这里</h1>

        <div className="mt-6 space-y-3">
          {records.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">暂无学习记录。</p>
          ) : (
            records.map((record) => (
              <article key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-950">{record.quiz_title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(record.created_at)}</p>
                  </div>
                  <div className="text-sm font-semibold text-blue-700">正确率 {Math.round(record.accuracy * 100)}%</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                  <span className="rounded-full bg-white px-3 py-1">{record.correct_count}/{record.question_count} 正确</span>
                  {(record.knowledge_points || []).map((point) => (
                    <span key={point} className="rounded-full bg-white px-3 py-1">{point}</span>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}

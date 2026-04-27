import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LineChart, Sparkles } from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import { getCurrentUser } from "@/lib/auth";

type RecordRow = {
  id: string;
  accuracy: number;
  knowledge_points: string[];
  created_at: string;
};

type WrongRow = {
  knowledge_point: string;
};

export default async function ReportPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: recordData }, { data: wrongData }] = await Promise.all([
    supabase.from("study_records").select("id,accuracy,knowledge_points,created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("wrong_questions").select("knowledge_point").eq("user_id", user.id)
  ]);
  const records = (recordData || []) as RecordRow[];
  const wrongs = (wrongData || []) as WrongRow[];
  const totalPractice = records.length;
  const averageAccuracy =
    records.length > 0 ? Math.round((records.reduce((total, item) => total + item.accuracy, 0) / records.length) * 100) : 0;
  const wrongMap = new Map<string, number>();
  wrongs.forEach((item) => {
    const key = item.knowledge_point || "未分类";
    wrongMap.set(key, (wrongMap.get(key) || 0) + 1);
  });
  const topWrongPoints = Array.from(wrongMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <LineChart className="h-4 w-4" />
          学习报告
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">练习表现与提升建议</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl bg-blue-50 p-5 text-blue-900">
            <div className="text-sm font-medium">总练习次数</div>
            <div className="mt-2 text-3xl font-semibold">{totalPractice}</div>
          </div>
          <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900">
            <div className="text-sm font-medium">平均正确率</div>
            <div className="mt-2 text-3xl font-semibold">{averageAccuracy}%</div>
          </div>
          <div className="rounded-3xl bg-amber-50 p-5 text-amber-900">
            <div className="text-sm font-medium">错题知识点</div>
            <div className="mt-2 text-3xl font-semibold">{topWrongPoints.length}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="mb-4 font-semibold text-slate-950">高频错题知识点</h2>
            {topWrongPoints.length === 0 ? (
              <p className="text-sm text-slate-500">暂无错题数据。</p>
            ) : (
              <div className="space-y-3">
                {topWrongPoints.map(([point, count]) => (
                  <div key={point} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
                    <span className="font-medium text-slate-800">{point}</span>
                    <span className="text-rose-600">{count} 次</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold text-blue-900">
              <Sparkles className="h-5 w-5" />
              AI 提升建议
            </div>
            <p className="text-sm leading-7 text-blue-950/80">
              {topWrongPoints.length > 0
                ? `建议优先复习「${topWrongPoints[0][0]}」，先回顾公式和典型解法，再用错题本重新练习 3 到 5 道同类型题。`
                : "完成几组同类型练习后，这里会根据正确率和错题知识点给出更具体的建议。"}
            </p>
          </div>
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}

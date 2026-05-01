import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import MobileBottomNav from "@/components/MobileBottomNav";
import { PageHeader } from "@/components/PageHeader";
import WrongbookClient from "@/components/WrongbookClient";
import type { WrongbookItem } from "@/components/WrongbookClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WrongbookPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("wrong_questions")
    .select(
      "id,question,options,answer_index,user_answer_index,explanation,knowledge_point,difficulty,subject,question_type,error_type,error_reason,improvement_suggestion,tags,created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(120);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Wrongbook"
        title="错题本"
        subtitle="按知识点、错因和复习节奏整理你的错题。"
        Icon={BookOpenCheck}
        actions={
          <Link href="/" prefetch className="qgyx-secondary px-4 py-2 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        }
      />

      <WrongbookClient wrongs={(data || []) as WrongbookItem[]} />
      <MobileBottomNav />
    </AppShell>
  );
}

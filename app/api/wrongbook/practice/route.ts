export const runtime = "nodejs";
export const maxDuration = 120;

import { apiError, apiSuccess } from "@/lib/api-response";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import type { OriginalExplanation, QuizResult } from "@/lib/ai/schema";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QuizQuestion } from "@/types/quiz";

function answerLetterToIndex(letter?: string) {
  return letter === "B" ? 1 : letter === "C" ? 2 : letter === "D" ? 3 : 0;
}

function toQuizQuestions(result: QuizResult): QuizQuestion[] {
  return result.questions.slice(0, 3).map((question) => ({
    id: question.id,
    question: question.question,
    options: question.options,
    answerIndex: answerLetterToIndex(question.correctAnswer),
    correctAnswer: question.correctAnswer,
    explanation: "先独立完成，答完后对照答案复盘错因。",
    knowledgePoint: question.topic,
    topic: question.topic,
    difficulty: question.difficulty,
    tags: [question.topic]
  }));
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再生成再练题。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as { wrongId?: string } | null;

    if (!body?.wrongId) {
      return apiError("缺少错题 ID。");
    }

    const admin = createSupabaseAdminClient();
    const { data: item, error } = await admin
      .from("wrong_questions")
      .select("id,user_id,question,options,answer_index,user_answer_index,explanation,knowledge_point,difficulty,subject,error_type,error_reason,tags")
      .eq("id", body.wrongId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!item) {
      return apiError("错题不存在或无权访问。", 404);
    }

    const options = Array.isArray(item.options) ? (item.options as string[]) : [];
    const originalExplanation: OriginalExplanation = {
      title: "错题再练",
      detectedText: String(item.question || ""),
      subject: String(item.subject || "综合"),
      topic: String(item.knowledge_point || "错题知识点"),
      difficulty: item.difficulty === "easy" || item.difficulty === "hard" ? item.difficulty : "medium",
      explanation: String(item.explanation || item.error_reason || "围绕本题错因进行相似训练。"),
      keySteps: [
        '错因：' + (item.error_type || '审题不清'),
        "先复盘原题条件",
        "再做同知识点变式题"
      ],
      finalAnswer: String(options[Number(item.answer_index || 0)] || ""),
      commonMistake: String(item.error_reason || "同类题容易在关键条件或方法选择上出错。"),
      similarIdeas: [
        "先定位原题考查的知识点",
        "把已知条件替换成同类型条件",
        "沿用正确解题步骤完成新题"
      ],
      steps: [],
      formulas: [],
      warnings: []
    };

    const quizResult = await generateQuiz({
      detectedText: `${item.question}\n错因：${item.error_type || ""}\n一句话：${item.error_reason || ""}`,
      originalExplanation,
      subject: originalExplanation.subject,
      topic: originalExplanation.topic,
      difficulty: originalExplanation.difficulty,
      questionCount: 3,
      language: "zh"
    });

    return apiSuccess({
      quiz: {
        title: "再练 3 题",
        summary: "基于这道错题的知识点和错因生成。",
        sourceType: "image",
        questions: toQuizQuestions(quizResult)
      }
    });
  } catch (error) {
    console.error("wrongbook_practice_failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return apiError("生成失败，请稍后重试", 500);
  }
}

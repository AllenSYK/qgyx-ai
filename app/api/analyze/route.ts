export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import {
  AiJsonFormatError,
  generateQuizFromImageWithQwen,
  generateQuizFromPdfTextWithQwen
} from "@/lib/ai";
import { ensureUserCredits, getCurrentUser } from "@/lib/auth";
import { extractPdfText } from "@/lib/pdf";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Quiz } from "@/types/quiz";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 10 * 1024 * 1024;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再上传题目图片。", 401);
    }

    const formData = await request.formData();
    const upload = formData.get("file") || formData.get("image");

    if (!upload || typeof upload === "string") {
      return errorResponse("请上传题目图片或 PDF 文档。");
    }

    const file = upload as File;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isImage && !isPdf) {
      return errorResponse("当前支持 jpg、png、webp 和 pdf 文件。");
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      return errorResponse("图片不能超过 5MB。");
    }

    if (isPdf && file.size > MAX_PDF_SIZE) {
      return errorResponse("PDF 不能超过 10MB。");
    }

    const credits = await ensureUserCredits(user, supabase);

    if (credits.remaining <= 0) {
      return errorResponse("次数不足，请联系管理员充值。", 402);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceType: Quiz["sourceType"] = isPdf ? "pdf" : "image";

    let quiz: Quiz;

    try {
      if (isPdf) {
        const pdfText = await extractPdfText(buffer);

        if (pdfText.replace(/\s/g, "").length < 80) {
          return errorResponse(
            "这个 PDF 可能是扫描版或图片型文档，当前版本暂时无法稳定提取文字。请截图题目后上传图片，或换成文本型 PDF。",
            422
          );
        }

        quiz = await generateQuizFromPdfTextWithQwen({
          text: pdfText,
          questionCount: 3
        });
      } else {
        const base64 = buffer.toString("base64");

        quiz = await generateQuizFromImageWithQwen({
          base64,
          mimeType: file.type || "image/png",
          questionCount: 3
        });
      }
    } catch (error) {
      if (error instanceof AiJsonFormatError) {
        return errorResponse("AI 返回格式暂时不稳定，请重新上传或稍后再试。", 502);
      }

      throw error;
    }

    const analysisText = "已使用千问模型直接根据上传内容生成同类型练习题。";

    const admin = createSupabaseAdminClient();

    const { data: session, error: sessionError } = await admin
      .from("quiz_sessions")
      .insert({
        user_id: user.id,
        image_analysis: analysisText,
        quiz
      })
      .select("id")
      .single();

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    await Promise.allSettled([
      admin
        .from("quiz_sessions")
        .update({
          source_type: sourceType,
          question_count: quiz.questions.length
        })
        .eq("id", session.id),

      admin.from("uploaded_files").insert({
        user_id: user.id,
        session_id: session.id,
        file_name: file.name,
        file_type: file.type || (isPdf ? "application/pdf" : "image/*"),
        file_size: file.size,
        source_kind: sourceType,
        status: "processed"
      }),

      admin.from("quiz_questions").insert(
        quiz.questions.map((question, index) => ({
          session_id: session.id,
          user_id: user.id,
          question_order: index + 1,
          question: question.question,
          options: question.options,
          answer_index: question.answerIndex,
          explanation: question.explanation,
          knowledge_point: question.knowledgePoint,
          difficulty: question.difficulty
        }))
      )
    ]);

    const nextRemaining = credits.remaining - 1;
    const now = new Date().toISOString();

    const { data: updatedCredits, error: creditError } = await admin
      .from("user_credits")
      .update({
        remaining: nextRemaining,
        updated_at: now
      })
      .eq("user_id", user.id)
      .select("remaining")
      .single();

    if (creditError) {
      throw new Error(creditError.message);
    }

    return NextResponse.json({
      sessionId: session.id as string,
      remainingCredits: updatedCredits.remaining as number,
      analysisText,
      quiz
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成 Quiz 失败，请稍后再试。";
    return errorResponse(message || "生成 Quiz 失败，请稍后再试。", 500);
  }
}

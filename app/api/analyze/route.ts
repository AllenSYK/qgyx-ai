import { NextResponse } from "next/server";
import { AiJsonFormatError, analyzeImageWithQwen, generateQuizFromAnalysis } from "@/lib/ai";
import { ensureUserCredits, getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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
    const upload = formData.get("image");

    if (!upload || typeof upload === "string") {
      return errorResponse("请上传一张题目图片。");
    }

    const image = upload as File;

    if (!image.type.startsWith("image/")) {
      return errorResponse("请上传有效的图片文件。");
    }

    if (image.size > MAX_IMAGE_SIZE) {
      return errorResponse("图片不能超过 5MB。");
    }

    const credits = await ensureUserCredits(user, supabase);

    if (credits.remaining <= 0) {
      return errorResponse("次数不足，请联系管理员充值。", 402);
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const analysisText = await analyzeImageWithQwen({
      base64,
      mimeType: image.type || "image/png"
    });

    let quiz;

    try {
      quiz = await generateQuizFromAnalysis(analysisText);
    } catch (error) {
      if (error instanceof AiJsonFormatError) {
        return errorResponse("AI 返回格式暂时不稳定，请重新上传或稍后再试。", 502);
      }

      throw error;
    }

    const admin = createSupabaseAdminClient();
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

    const { error: sessionError } = await admin.from("quiz_sessions").insert({
      user_id: user.id,
      image_analysis: analysisText,
      quiz
    });

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    return NextResponse.json({
      remainingCredits: updatedCredits.remaining as number,
      analysisText,
      quiz
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成 Quiz 失败，请稍后再试。";
    return errorResponse(message || "生成 Quiz 失败，请稍后再试。", 500);
  }
}

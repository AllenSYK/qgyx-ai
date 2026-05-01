export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 300;

import crypto from "crypto";
import { after } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  JOB_PROGRESS,
  JOB_STAGE_TEXT,
  originalExplanationToAnalysisResult,
  quizResultToLegacyQuiz,
  updateJobStatus,
  type AnalysisJobStatus
} from "@/lib/analysis-jobs";
import { generateOriginalExplanation } from "@/lib/ai/generateOriginalExplanation";
import { generateOriginalExplanationFromImage } from "@/lib/ai/generateOriginalExplanationFromImage";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import {
  ImageNotClearError,
  assertUsableOriginalExplanation,
  isUsableOriginalExplanation,
  normalizeOriginalExplanationShape
} from "@/lib/ai/originalExplanationQuality";
import { recognizeQuestionContent } from "@/lib/ai/recognizeQuestionContent";
import {
  AiConfigurationError,
  AiTimeoutError,
  consumeLastAiUsage,
  getQwenModelName
} from "@/lib/ai/qwen";
import type { OriginalExplanation, QuizResult } from "@/lib/ai/schema";
import { getCurrentUser } from "@/lib/auth";
import { extractPdfText } from "@/lib/pdf";
import { getRequestMeta } from "@/lib/request-meta";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  applySoftLimitDelay,
  createGenerationAllowancePayload,
  deductGenerationCredit,
  getGenerationAllowance
} from "@/lib/membership";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";
import type { Quiz, StudyMode } from "@/types/quiz";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PDF_SIZE = 10 * 1024 * 1024;
const FALLBACK_TEXT_MIN_LENGTH = 30;
const studyModes: StudyMode[] = ["quiz", "analysis", "quiz_analysis"];

class AnalyzeRouteError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "AnalyzeRouteError";
    this.status = status;
  }
}

function normalizeMode(value: FormDataEntryValue | null): StudyMode {
  if (typeof value !== "string") {
    return "quiz_analysis";
  }

  return studyModes.includes(value as StudyMode) ? (value as StudyMode) : "quiz_analysis";
}

function getFileExtension(file: File, fallback: string) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (fromName || fallback).replace(/[^a-z0-9]/gi, "").toLowerCase() || fallback;
}

function createHash(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createTextHash(text: string) {
  return crypto.createHash("sha256").update(text.replace(/\s+/g, "").trim()).digest("hex");
}

function compactTextLength(text: string) {
  return String(text || "").replace(/\s+/g, "").length;
}

async function uploadToStorage({
  admin,
  userId,
  file,
  buffer,
  imageHash,
  sourceType
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  file: File;
  buffer: Buffer;
  imageHash: string;
  sourceType: Quiz["sourceType"];
}) {
  const bucket = process.env.SUPABASE_UPLOAD_BUCKET || "uploads";
  const extension = getFileExtension(file, sourceType === "pdf" ? "pdf" : "jpg");
  const objectPath = `${userId}/${Date.now()}-${imageHash.slice(0, 16)}.${extension}`;

  try {
    const { error } = await admin.storage.from(bucket).upload(objectPath, buffer, {
      contentType: file.type || (sourceType === "pdf" ? "application/pdf" : "image/jpeg"),
      upsert: false
    });

    if (error) {
      console.warn("Storage upload skipped:", error.message);
      return null;
    }

    const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl || null;
  } catch (error) {
    console.warn("Storage upload failed:", error);
    return null;
  }
}

async function writeUsageLog({
  admin,
  userId,
  jobId,
  mode,
  action,
  status,
  errorMessage,
  request
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  jobId?: string | null;
  mode: StudyMode;
  action: string;
  status: "success" | "failed";
  errorMessage?: string | null;
  request?: Request;
}) {
  try {
    const usage = consumeLastAiUsage();
    const meta = request ? getRequestMeta(request) : null;
    const tokensUsed = usage?.total_tokens ?? null;

    await admin.from("ai_usage_logs").insert({
      user_id: userId,
      job_id: jobId || null,
      mode,
      action,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: tokensUsed,
      tokens_used: tokensUsed,
      model: getQwenModelName(),
      status,
      error_message: errorMessage || null,
      ip_address: meta?.ipAddress ?? null,
      ip_country: meta?.ipCountry ?? null,
      ip_region: meta?.ipRegion ?? null,
      ip_city: meta?.ipCity ?? null
    });
  } catch (error) {
    console.error("AI usage log write failed:", error);
  }
}

async function markJobFailed(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  jobId: string | null,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "AI 生成失败，请重试";

  if (jobId) {
    try {
      await updateJobStatus(admin, jobId, "failed", {
        error_message: message
      });
    } catch (updateError) {
      console.error("Failed to update analysis job status:", updateError);
    }
  }

  return message;
}

async function createLegacyAnalysisRecord({
  admin,
  userId,
  mode,
  sourceType,
  imageUrl,
  originalExplanation,
  request
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  mode: StudyMode;
  sourceType: Quiz["sourceType"];
  imageUrl: string | null;
  originalExplanation: OriginalExplanation;
  request: Request;
}) {
  const meta = getRequestMeta(request);
  const analysis = originalExplanationToAnalysisResult(originalExplanation);

  const { data, error } = await admin
    .from("analysis_records")
    .insert({
      user_id: userId,
      image_url: imageUrl,
      source_type: sourceType,
      mode,
      recognized_text: analysis.recognizedText,
      answer: analysis.answer,
      explanation: analysis.explanation,
      knowledge_points: analysis.knowledgePoints,
      common_mistakes: analysis.commonMistakes,
      similar_ideas: analysis.similarIdeas,
      tags: analysis.tags || analysis.knowledgePoints,
      ip_address: meta.ipAddress,
      ip_country: meta.ipCountry,
      ip_region: meta.ipRegion,
      ip_city: meta.ipCity
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

async function createLegacyQuizRecords({
  admin,
  userId,
  mode,
  quizResult,
  originalExplanation
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  mode: StudyMode;
  quizResult: QuizResult;
  originalExplanation: OriginalExplanation;
}) {
  const legacyQuiz = quizResultToLegacyQuiz(quizResult, originalExplanation);

  const { data: session, error: sessionError } = await admin
    .from("quiz_sessions")
    .insert({
      user_id: userId,
      image_analysis: originalExplanation.explanation,
      quiz: legacyQuiz,
      source_type: "image",
      question_count: legacyQuiz.questions.length
    })
    .select("id")
    .single();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const sessionId = session.id as string;

  await Promise.allSettled([
    admin.from("quiz_questions").insert(
      legacyQuiz.questions.map((question, index) => ({
        session_id: sessionId,
        user_id: userId,
        question_order: index + 1,
        question: question.question,
        options: question.options,
        answer_index: question.answerIndex,
        explanation: question.explanation || null,
        knowledge_point: question.knowledgePoint,
        difficulty: question.difficulty,
        tags: question.tags || []
      }))
    ),
    admin.from("quiz_records").upsert(
      {
        user_id: userId,
        session_id: sessionId,
        quiz_title: legacyQuiz.title,
        mode,
        questions: legacyQuiz.questions,
        answers: {},
        score: 0,
        wrong_questions: [],
        current_index: 0,
        is_completed: false
      },
      { onConflict: "user_id,session_id" }
    )
  ]);

  return sessionId;
}

async function generateQuizForJob({
  admin,
  jobId,
  userId,
  mode,
  language
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  jobId: string;
  userId: string;
  mode: StudyMode;
  language: AppLanguage;
}) {
  try {
    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id,status,detected_text,original_explanation,quiz_result,language")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!job || job.quiz_result) {
      return;
    }

    const originalExplanation = job.original_explanation as OriginalExplanation | null;
    const detectedText = String(job.detected_text || originalExplanation?.detectedText || "");

    if (!originalExplanation || !isUsableOriginalExplanation(originalExplanation)) {
      throw new Error("缺少原题解析，无法继续生成 Quiz。");
    }

    if (!detectedText.trim()) {
      throw new Error("缺少真实题干，无法继续生成 Quiz。");
    }

    await updateJobStatus(admin, jobId, "generating_quiz", {
      error_message: null
    });

    const quizResult = await generateQuiz({
      detectedText,
      originalExplanation,
      subject: originalExplanation.subject,
      topic: originalExplanation.topic,
      difficulty: originalExplanation.difficulty,
      questionCount: 3,
      language
    });

    await updateJobStatus(admin, jobId, "completed", {
      quiz_result: quizResult,
      error_message: null
    });

    await Promise.allSettled([
      createLegacyQuizRecords({
        admin,
        userId,
        mode,
        quizResult,
        originalExplanation
      }),
      writeUsageLog({
        admin,
        userId,
        jobId,
        mode,
        action: "generate_quiz",
        status: "success"
      })
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quiz 后台生成失败。";
    await markJobFailed(admin, jobId, new Error(`Quiz 生成失败，可重试：${message}`));
    await writeUsageLog({
      admin,
      userId,
      jobId,
      mode,
      action: "generate_quiz",
      status: "failed",
      errorMessage: message
    });
  }
}

function scheduleBackground(work: () => Promise<void>) {
  after(() => {
    void work();
  });
}

async function createJob(admin: ReturnType<typeof createSupabaseAdminClient>, payload: Record<string, unknown>) {
  const { data, error } = await admin
    .from("analysis_jobs")
    .insert(payload)
    .select("id,status,progress,stage,image_url,language,original_explanation,quiz_result,wrong_explanations,quiz_answers,pdf_url,error_message")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function updateJobAndReturn(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  jobId: string,
  status: AnalysisJobStatus,
  patch: Record<string, unknown>
) {
  const { data, error } = await admin
    .from("analysis_jobs")
    .update({
      status,
      progress: JOB_PROGRESS[status],
      stage: JOB_STAGE_TEXT[status],
      updated_at: new Date().toISOString(),
      ...patch
    })
    .eq("id", jobId)
    .select("id,status,progress,stage,image_url,language,original_explanation,quiz_result,wrong_explanations,quiz_answers,pdf_url,error_message")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findCachedOriginal({
  admin,
  hashColumn,
  hash,
  language
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  hashColumn: "image_hash" | "ocr_hash";
  hash: string;
  language: AppLanguage;
}) {
  if (!hash) {
    return null;
  }

  const { data, error } = await admin
    .from("analysis_jobs")
    .select("detected_text,original_explanation,quiz_result,image_url")
    .eq(hashColumn, hash)
    .eq("language", language)
    .eq("status", "completed")
    .not("original_explanation", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const original = data?.original_explanation
    ? normalizeOriginalExplanationShape(data.original_explanation as OriginalExplanation)
    : null;

  if (!original || !isUsableOriginalExplanation(original)) {
    return null;
  }

  return {
    detectedText: String(data?.detected_text || original.detectedText || ""),
    imageUrl: (data?.image_url as string | null | undefined) || null,
    original,
    quizResult: (data?.quiz_result as QuizResult | null | undefined) || null
  };
}

function cachedStatusForMode(mode: StudyMode, quizResult: QuizResult | null): AnalysisJobStatus {
  if (mode === "analysis" || quizResult) {
    return "completed";
  }

  return "explanation_done";
}

async function createCachedJobResponse({
  admin,
  userId,
  mode,
  language,
  allowance,
  existingJobId,
  imageHash,
  ocrHash,
  imageUrl,
  cached
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  mode: StudyMode;
  language: AppLanguage;
  allowance: Awaited<ReturnType<typeof getGenerationAllowance>>;
  existingJobId?: string | null;
  imageHash?: string;
  ocrHash?: string;
  imageUrl?: string | null;
  cached: {
    detectedText: string;
    imageUrl: string | null;
    original: OriginalExplanation;
    quizResult: QuizResult | null;
  };
}) {
  const quizResult = mode === "analysis" ? null : cached.quizResult;
  const status = cachedStatusForMode(mode, quizResult);
  const patch = {
    language,
    image_url: imageUrl || cached.imageUrl || null,
    image_hash: imageHash || null,
    ocr_hash: ocrHash || null,
    detected_text: cached.detectedText,
    original_explanation: cached.original,
    quiz_result: quizResult,
    quiz_answers: {},
    wrong_explanations: {},
    error_message: null
  };
  const row = existingJobId
    ? await updateJobAndReturn(admin, existingJobId, status, patch)
    : await createJob(admin, {
        user_id: userId,
        status,
        progress: JOB_PROGRESS[status],
        stage: JOB_STAGE_TEXT[status],
        ...patch
      });

  if (mode !== "analysis" && !quizResult) {
    scheduleBackground(() =>
      generateQuizForJob({
        admin,
        jobId: row.id as string,
        userId,
        mode,
        language
      })
    );
  }

  return apiSuccess({
    jobId: row.id,
    status,
    progress: JOB_PROGRESS[status],
    stage: status === "explanation_done" ? "原题解析已完成，Quiz 正在后台生成" : JOB_STAGE_TEXT[status],
    language,
    cached: true,
    imageUrl: imageUrl || cached.imageUrl || null,
    ...createGenerationAllowancePayload(allowance),
    originalExplanation: cached.original,
    analysis: originalExplanationToAnalysisResult(cached.original),
    quizResult,
    quiz: quizResult ? quizResultToLegacyQuiz(quizResult, cached.original) : null
  });
}

function sanitizeOriginalExplanation(originalExplanation: OriginalExplanation) {
  return assertUsableOriginalExplanation(originalExplanation);
}

async function generateImageOriginalWithFallback({
  base64,
  mimeType,
  imageSummary,
  userId,
  language
}: {
  base64: string;
  mimeType: string;
  imageSummary: string;
  userId: string;
  language: AppLanguage;
}) {
  try {
    return {
      originalExplanation: await generateOriginalExplanationFromImage({
        base64,
        mimeType,
        imageSummary,
        userId,
        language
      }),
      detectedText: "",
      ocrHash: "",
      fallbackImageSummary: ""
    };
  } catch (error) {
    if (!(error instanceof AiTimeoutError)) {
      throw error;
    }

    const recognition = await recognizeQuestionContent({
      base64,
      mimeType,
      language
    });
    const detectedText = recognition.detectedText || "";

    if (compactTextLength(detectedText) < FALLBACK_TEXT_MIN_LENGTH) {
      throw new AnalyzeRouteError("图片识别超时，请上传更清晰、裁剪后的题目图片。", 422);
    }

    return {
      originalExplanation: null,
      detectedText,
      ocrHash: createTextHash(detectedText),
      fallbackImageSummary: recognition.imageSummary || "Qwen VL 超时后提取到的题目文字。"
    };
  }
}

function toHttpError(error: unknown) {
  if (error instanceof AnalyzeRouteError) {
    return {
      message: error.message,
      status: error.status
    };
  }

  if (error instanceof ImageNotClearError) {
    return {
      message: "图片未能识别出明确题目，请上传更清晰的题目截图。",
      status: 422
    };
  }

  if (error instanceof AiConfigurationError) {
    return {
      message: error.message,
      status: 503
    };
  }

  if (error instanceof AiTimeoutError) {
    return {
      message: "AI 请求超时，请稍后重试或上传更清晰的题目图片。",
      status: 503
    };
  }

  const message = error instanceof Error ? error.message : "AI 生成失败，请重试。";
  const status =
    /无法识别|未能识别|识别超时|图片|题目内容|PDF/.test(message)
      ? 422
      : /DeepSeek|Qwen|AI 服务|超时|配置/.test(message)
        ? 503
        : 500;

  return { message, status };
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  let modeForLog: StudyMode = "quiz_analysis";
  let userIdForLog: string | null = null;

  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再上传题目。", 401);
    }

    userIdForLog = user.id;

    const admin = createSupabaseAdminClient();
    const formData = await request.formData();
    const mode = normalizeMode(formData.get("mode"));
    const language = normalizeLanguage(formData.get("language"));
    const upload = formData.get("file") || formData.get("image");
    modeForLog = mode;

    if (!upload || typeof upload === "string") {
      return apiError("请上传题目图片或 PDF 文件。");
    }

    const file = upload as File;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isImage && !isPdf) {
      return apiError("当前支持 jpg、png、webp 和 pdf 文件。");
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      return apiError("图片不能超过 5MB，请先压缩后再上传。");
    }

    if (isPdf && file.size > MAX_PDF_SIZE) {
      return apiError("PDF 不能超过 10MB。");
    }

    const allowance = await getGenerationAllowance(admin, user.id);

    if (allowance.isBanned) {
      return apiError("账户状态异常，请联系客服处理。微信：15155132939", 403);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageHash = createHash(buffer);
    const sourceType: Quiz["sourceType"] = isPdf ? "pdf" : "image";

    const cachedByImageHash = await findCachedOriginal({
      admin,
      hashColumn: "image_hash",
      hash: imageHash,
      language
    });

    if (cachedByImageHash) {
      return createCachedJobResponse({
        admin,
        userId: user.id,
        mode,
        language,
        allowance,
        imageHash,
        cached: cachedByImageHash
      });
    }

    if (!allowance.allowed) {
      const reason =
        allowance.monthlyRemaining === 0
          ? "本月生成额度已用完，请下月再试或联系管理员处理。"
          : allowance.dailyRemaining <= 0
            ? "今日会员额度已用完，请明天再试或升级会员。"
            : "剩余生成次数不足，请联系管理员充值或开通会员。";
      return apiError(reason, 402);
    }

    await applySoftLimitDelay(allowance.speedMode);

    const imageUrl = await uploadToStorage({
      admin,
      userId: user.id,
      file,
      buffer,
      imageHash,
      sourceType
    });

    const created = await createJob(admin, {
      user_id: user.id,
      status: "uploading",
      progress: JOB_PROGRESS.uploading,
      stage: JOB_STAGE_TEXT.uploading,
      language,
      image_url: imageUrl,
      image_hash: imageHash,
      quiz_answers: {},
      wrong_explanations: {}
    });

    jobId = created.id as string;

    let detectedText = "";
    let imageSummary = "";
    let ocrHash = "";
    let originalExplanationRaw: OriginalExplanation;
    const imageMimeType = file.type || "image/jpeg";

    if (isPdf) {
      await updateJobStatus(admin, jobId, "ocr_processing");
      detectedText = await extractPdfText(buffer);
      imageSummary = "用户上传的是文本型 PDF。";

      if (compactTextLength(detectedText) < 80) {
        throw new AnalyzeRouteError("这个 PDF 可能是扫描版或图片型文档，当前版本无法稳定提取文字。请截图题目后以图片上传。", 422);
      }

      ocrHash = createTextHash(detectedText);
      const cachedByOcr = await findCachedOriginal({
        admin,
        hashColumn: "ocr_hash",
        hash: ocrHash,
        language
      });

      if (cachedByOcr) {
        return createCachedJobResponse({
          admin,
          userId: user.id,
          mode,
          language,
          allowance,
          existingJobId: jobId,
          imageHash,
          ocrHash,
          imageUrl,
          cached: cachedByOcr
        });
      }

      await updateJobStatus(admin, jobId, "generating_explanation", {
        detected_text: detectedText,
        ocr_hash: ocrHash
      });

      originalExplanationRaw = await generateOriginalExplanation({
        detectedText,
        imageSummary,
        userId: user.id,
        language
      });
    } else {
      await updateJobStatus(admin, jobId, "generating_explanation");
      const imageBase64 = buffer.toString("base64");
      const generated = await generateImageOriginalWithFallback({
        base64: imageBase64,
        mimeType: imageMimeType,
        imageSummary,
        userId: user.id,
        language
      });

      detectedText = generated.detectedText;
      ocrHash = generated.ocrHash;

      if (ocrHash) {
        const cachedByOcr = await findCachedOriginal({
          admin,
          hashColumn: "ocr_hash",
          hash: ocrHash,
          language
        });

        if (cachedByOcr) {
          return createCachedJobResponse({
            admin,
            userId: user.id,
            mode,
            language,
            allowance,
            existingJobId: jobId,
            imageHash,
            ocrHash,
            imageUrl,
            cached: cachedByOcr
          });
        }
      }

      if (generated.originalExplanation) {
        originalExplanationRaw = generated.originalExplanation;
      } else {
        await updateJobStatus(admin, jobId, "generating_explanation", {
          detected_text: detectedText,
          ocr_hash: ocrHash
        });

        originalExplanationRaw = await generateOriginalExplanation({
          detectedText,
          imageSummary: generated.fallbackImageSummary,
          userId: user.id,
          language
        });
      }
    }

    const originalExplanation = sanitizeOriginalExplanation(originalExplanationRaw);
    const effectiveDetectedText = detectedText || originalExplanation.detectedText;
    const effectiveOcrHash = effectiveDetectedText ? createTextHash(effectiveDetectedText) : ocrHash;
    const nextStatus: AnalysisJobStatus = mode === "analysis" ? "completed" : "explanation_done";
    const row = await updateJobAndReturn(admin, jobId, nextStatus, {
      detected_text: effectiveDetectedText,
      ...(effectiveOcrHash ? { ocr_hash: effectiveOcrHash } : {}),
      original_explanation: originalExplanation,
      error_message: null
    });

    await writeUsageLog({
      admin,
      userId: user.id,
      jobId,
      mode,
      action: "original_explanation",
      status: "success",
      request
    });

    const [remainingCredits, analysisRecordResult] = await Promise.allSettled([
      deductGenerationCredit(admin, user.id),
      createLegacyAnalysisRecord({
        admin,
        userId: user.id,
        mode,
        sourceType,
        imageUrl,
        originalExplanation,
        request
      }),
      admin.from("uploaded_files").insert({
        user_id: user.id,
        session_id: null,
        file_name: file.name,
        file_type: file.type || (isPdf ? "application/pdf" : "image/*"),
        file_size: file.size,
        source_kind: sourceType,
        status: "processed",
        ip_address: getRequestMeta(request).ipAddress,
        ip_country: getRequestMeta(request).ipCountry,
        ip_region: getRequestMeta(request).ipRegion,
        ip_city: getRequestMeta(request).ipCity
      })
    ]);

    const refreshedAllowance = await getGenerationAllowance(admin, user.id).catch(() => ({
      ...allowance,
      creditsRemaining:
        remainingCredits.status === "fulfilled" ? remainingCredits.value : allowance.creditsRemaining
    }));

    if (mode !== "analysis") {
      scheduleBackground(() =>
        generateQuizForJob({
          admin,
          jobId: jobId as string,
          userId: user.id,
          mode,
          language
        })
      );
    }

    return apiSuccess({
      jobId,
      status: row.status,
      progress: row.progress,
      stage: mode === "analysis" ? row.stage : "原题解析已完成，Quiz 正在后台生成",
      language,
      cached: false,
      imageUrl,
      analysisRecordId:
        analysisRecordResult.status === "fulfilled" ? analysisRecordResult.value : null,
      ...createGenerationAllowancePayload(refreshedAllowance),
      originalExplanation,
      analysis: originalExplanationToAnalysisResult(originalExplanation),
      quizResult: null,
      quiz: null
    });
  } catch (error) {
    const admin = createSupabaseAdminClient();
    const { message, status } = toHttpError(error);
    await markJobFailed(admin, jobId, new Error(message));

    if (jobId && userIdForLog) {
      await writeUsageLog({
        admin,
        userId: userIdForLog,
        jobId,
        mode: modeForLog,
        action: "analyze",
        status: "failed",
        errorMessage: message,
        request
      });
    }

    return apiError(message || "AI 生成失败，请重试。", status);
  }
}

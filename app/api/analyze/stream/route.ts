export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 300;

import crypto from "crypto";
import { apiError } from "@/lib/api-response";
import {
  JOB_PROGRESS,
  JOB_STAGE_TEXT,
  originalExplanationToAnalysisResult,
  quizResultToLegacyQuiz,
  updateJobStatus,
  type AnalysisJobStatus
} from "@/lib/analysis-jobs";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import {
  createOriginalExplanationFromMarkdown,
  isImageNotClearMarkdown,
  markdownFromOriginalExplanation
} from "@/lib/ai/originalExplanationFromMarkdown";
import {
  AiConfigurationError,
  AiModelError,
  AiTimeoutError,
  QWEN_VL_MODEL,
  consumeLastAiUsage,
  getQwenModelName,
  streamQwenChatCompletion,
  type ChatMessage
} from "@/lib/ai/qwen";
import type { OriginalExplanation, QuizResult } from "@/lib/ai/schema";
import { getCurrentUser } from "@/lib/auth";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";
import {
  createGenerationAllowancePayload,
  deductGenerationCredit,
  getGenerationAllowance
} from "@/lib/membership";
import { getRequestMeta } from "@/lib/request-meta";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StudyMode } from "@/types/quiz";
import {
  assertUsableOriginalExplanation,
  isUsableOriginalExplanation,
  normalizeOriginalExplanationShape
} from "@/lib/ai/originalExplanationQuality";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 0;
const STREAM_TOTAL_TIMEOUT_MS = 180_000;
const VISION_STREAM_MAX_TOKENS = Number(process.env.QWEN_VL_MAX_TOKENS || 2200);
const studyModes: StudyMode[] = ["quiz", "analysis", "quiz_analysis"];

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

class AnalyzeStreamError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "AnalyzeStreamError";
    this.status = status;
  }
}

function normalizeMode(value: FormDataEntryValue | null): StudyMode {
  if (typeof value !== "string") {
    return "quiz_analysis";
  }

  return studyModes.includes(value as StudyMode) ? (value as StudyMode) : "quiz_analysis";
}

function createHash(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createTextHash(text: string) {
  return crypto.createHash("sha256").update(text.replace(/\s+/g, "").trim()).digest("hex");
}

function getFileExtension(file: File, fallback: string) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (fromName || fallback).replace(/[^a-z0-9]/gi, "").toLowerCase() || fallback;
}

async function uploadToStorage({
  admin,
  userId,
  file,
  buffer,
  imageHash
}: {
  admin: AdminClient;
  userId: string;
  file: File;
  buffer: Buffer;
  imageHash: string;
}) {
  const bucket = process.env.SUPABASE_UPLOAD_BUCKET || "uploads";
  const extension = getFileExtension(file, "jpg");
  const objectPath = `${userId}/${Date.now()}-${imageHash.slice(0, 16)}.${extension}`;

  try {
    const { error } = await admin.storage.from(bucket).upload(objectPath, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false
    });

    if (error) {
      console.warn("stream_storage_upload_skipped", error.message);
      return null;
    }

    const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl || null;
  } catch (error) {
    console.warn("stream_storage_upload_failed", error);
    return null;
  }
}

async function createJob(admin: AdminClient, payload: Record<string, unknown>) {
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
  admin: AdminClient,
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
  imageHash,
  language
}: {
  admin: AdminClient;
  imageHash: string;
  language: AppLanguage;
}) {
  const { data, error } = await admin
    .from("analysis_jobs")
    .select("detected_text,original_explanation,quiz_result,image_url,status")
    .eq("image_hash", imageHash)
    .eq("language", language)
    .in("status", ["completed", "explanation_done", "generating_quiz", "quiz_done"])
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
  admin: AdminClient;
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

    return true;
  } catch (error) {
    console.error("stream_ai_usage_log_write_failed", error);
    return false;
  }
}

async function createLegacyAnalysisRecord({
  admin,
  userId,
  mode,
  imageUrl,
  originalExplanation,
  request
}: {
  admin: AdminClient;
  userId: string;
  mode: StudyMode;
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
      source_type: "image",
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

async function generateQuizForStreamJob({
  admin,
  jobId,
  userId,
  mode,
  language
}: {
  admin: AdminClient;
  jobId: string;
  userId: string;
  mode: StudyMode;
  language: AppLanguage;
}) {
  try {
    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id,status,detected_text,original_explanation,quiz_result")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!job || job.quiz_result || job.status !== "explanation_done") {
      return;
    }

    const originalExplanation = job.original_explanation as OriginalExplanation | null;

    if (!originalExplanation || !isUsableOriginalExplanation(originalExplanation)) {
      throw new Error("缺少原题解析，无法继续生成 Quiz。");
    }

    const { data: claimed, error: claimError } = await admin
      .from("analysis_jobs")
      .update({
        status: "generating_quiz",
        progress: JOB_PROGRESS.generating_quiz,
        stage: "Quiz 正在后台生成",
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .eq("status", "explanation_done")
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw new Error(claimError.message);
    }

    if (!claimed) {
      return;
    }

    const quizResult = await generateQuiz({
      detectedText: String(job.detected_text || originalExplanation.detectedText),
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

    await writeUsageLog({
      admin,
      userId,
      jobId,
      mode,
      action: "generate_quiz",
      status: "success"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quiz 后台生成失败。";
    console.error("stream_generate_quiz_failed", {
      jobId,
      error: message
    });

    await updateJobStatus(admin, jobId, "failed", {
      error_message: `解析已生成，但 Quiz 生成失败，可重试 Quiz：${message}`
    }).catch((updateError) => {
      console.error("stream_generate_quiz_mark_failed_failed", updateError);
    });

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

function outputLanguageText(language: AppLanguage) {
  return language === "en" ? "English" : "中文";
}

function buildFastVisionMessages({
  base64,
  mimeType,
  language
}: {
  base64: string;
  mimeType: string;
  language: AppLanguage;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一个数学与理科学习题目解析助手。请直接识别图片中的真实题目并解答，用 ${outputLanguageText(language)} 输出 Markdown。

你只能输出一份原题解析，不要重复生成原题解析 / AI已完成原题解析 / 题目解析等多个区块。

必须按下面结构输出：

## 题目
写出识别到的题干、公式、图形信息、表格或选项。

## 答案
给出最终答案。

## 解析
按步骤推导。所有数学内容必须使用标准 LaTeX：
- 行内公式必须写成 $...$
- 独立公式必须写成 $...$
- 幂次写成 $x^2$，不要写成 x² 或 x^2 普通文本
- 分式写成 $\\frac{a}{b}$，不要写成 a/b
- 根号写成 $\\sqrt{x}$，不要写成 sqrt(x)
- 向量写成 $\\vec{a}$ 或 $\\mathbf{a}$
- 角度、三角函数、概率、导数、积分、极限都必须用 LaTeX
- 不要把公式放进代码块，不要用反引号包公式

## 涉及知识点
用 2-4 个要点总结，每个要点里如果有公式也必须用 LaTeX。

## 易错点
指出最容易错的地方，涉及公式必须用 LaTeX。

## 类似题目思路
给 2-3 条同类题的解题迁移思路，涉及公式必须用 LaTeX。

禁止：
- 不要描述图片边框、浏览器、手机截图、黑边或无关 UI
- 不要说根据图片中可见信息
- 不要说图片内容复杂
- 不要说系统已尝试
- 不要输出乱码公式
- 不要输出代码块
- 不要重复输出第二份解析

如果确实看不清题目，只输出：题目不清晰，无法可靠识别。`
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "请识别并解析图片中的题目。数学公式必须用 LaTeX 渲染格式。"
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`
          }
        }
      ]
    }
  ];
}

function toHttpError(error: unknown) {
  if (error instanceof AnalyzeStreamError) {
    return {
      message: error.message,
      status: error.status
    };
  }

  if (error instanceof AiConfigurationError) {
    return {
      message: error.message,
      status: 503
    };
  }

  if (error instanceof AiModelError) {
    return {
      message: error.message,
      status: error.status >= 500 ? 503 : error.status
    };
  }

  if (error instanceof AiTimeoutError) {
    return {
      message: "模型响应超时，请稍后重试。",
      status: 503
    };
  }

  const message = error instanceof Error ? error.message : "AI 解析失败，请稍后重试。";
  const status =
    /图片|题目不清晰|无法可靠识别|无法识别|PDF/.test(message)
      ? 422
      : /API Key|模型|AI|Qwen|超时|限流/.test(message)
        ? 503
        : 500;

  return { message, status };
}

function sseEncode(event: string, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function statusForMode(mode: StudyMode): AnalysisJobStatus {
  return mode === "analysis" ? "completed" : "explanation_done";
}

async function createCachedResponse({
  admin,
  userId,
  mode,
  language,
  allowance,
  imageHash,
  cached
}: {
  admin: AdminClient;
  userId: string;
  mode: StudyMode;
  language: AppLanguage;
  allowance: Awaited<ReturnType<typeof getGenerationAllowance>>;
  imageHash: string;
  cached: {
    detectedText: string;
    imageUrl: string | null;
    original: OriginalExplanation;
    quizResult: QuizResult | null;
  };
}) {
  const quizResult = mode === "analysis" ? null : cached.quizResult;
  const status: AnalysisJobStatus = mode === "analysis" || quizResult ? "completed" : "explanation_done";

  const row = await createJob(admin, {
    user_id: userId,
    status,
    progress: JOB_PROGRESS[status],
    stage: JOB_STAGE_TEXT[status],
    language,
    image_url: cached.imageUrl,
    image_hash: imageHash,
    detected_text: cached.detectedText,
    ocr_hash: cached.detectedText ? createTextHash(cached.detectedText) : null,
    original_explanation: cached.original,
    quiz_result: quizResult,
    quiz_answers: {},
    wrong_explanations: {},
    error_message: null
  });

  const markdown = markdownFromOriginalExplanation(cached.original);

  return {
    jobId: row.id as string,
    payload: {
      jobId: row.id,
      status,
      progress: JOB_PROGRESS[status],
      stage: status === "explanation_done" ? "原题解析已完成，Quiz 正在后台生成" : JOB_STAGE_TEXT[status],
      language,
      cached: true,
      imageUrl: cached.imageUrl,
      analysisText: markdown,
      ...createGenerationAllowancePayload(allowance),
      originalExplanation: cached.original,
      analysis: originalExplanationToAnalysisResult(cached.original),
      quizResult,
      quiz: quizResult ? quizResultToLegacyQuiz(quizResult, cached.original) : null
    }
  };
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

    const formData = await request.formData();
    const mode = normalizeMode(formData.get("mode"));
    const language = normalizeLanguage(formData.get("language"));
    const upload = formData.get("file") || formData.get("image");
    modeForLog = mode;

    if (!upload || typeof upload === "string") {
      return apiError("请上传题目图片。");
    }

    const file = upload as File;
    const isImage = file.type.startsWith("image/");

    if (!isImage) {
      return apiError("流式极速解析仅支持图片，PDF 请使用普通解析入口。", 415);
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return apiError("图片太大，请压缩后重试。");
    }

    const admin = createSupabaseAdminClient();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullMarkdown = "";

        const send = (event: string, payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEncode(event, payload)));
        };

        send("meta", {
          jobId: null,
          status: "queued",
          progress: 5,
          stage: "已收到图片，正在准备解析",
          language,
          cached: false
        });

        try {
          send("meta", {
            jobId: null,
            status: "queued",
            progress: 10,
            stage: "正在读取图片",
            language,
            cached: false
          });

          const buffer = Buffer.from(await file.arrayBuffer());
          const imageHash = createHash(buffer);
          const base64 = buffer.toString("base64");
          const mimeType = file.type || "image/jpeg";

          send("meta", {
            jobId: null,
            status: "queued",
            progress: 18,
            stage: "正在检查会员与缓存",
            language,
            cached: false
          });

          const allowance = await getGenerationAllowance(admin, user.id);

          if (allowance.isBanned) {
            throw new AnalyzeStreamError("账户状态异常，请联系客服处理。微信：15155132939", 403);
          }

          const cached = await findCachedOriginal({
            admin,
            imageHash,
            language
          });

          if (cached) {
            const cachedResponse = await createCachedResponse({
              admin,
              userId: user.id,
              mode,
              language,
              allowance,
              imageHash,
              cached
            });

            jobId = cachedResponse.jobId;

            send("meta", cachedResponse.payload);
            send("done", cachedResponse.payload);

            if (mode !== "analysis" && !cached.quizResult) {
              void generateQuizForStreamJob({
                admin,
                jobId: cachedResponse.jobId,
                userId: user.id,
                mode,
                language
              });
            }

            controller.close();
            return;
          }

          if (!allowance.allowed) {
            const reason =
              allowance.monthlyRemaining === 0
                ? "本月生成额度已用完，请下月再试或联系管理员处理。"
                : allowance.dailyRemaining <= 0
                  ? "今日会员额度已用完，请明天再试或升级会员。"
                  : "剩余生成次数不足，请联系管理员充值或开通会员。";

            throw new AnalyzeStreamError(reason, 402);
          }

          send("meta", {
            jobId: null,
            status: "queued",
            progress: 28,
            stage: "正在创建任务",
            language,
            cached: false,
            ...createGenerationAllowancePayload(allowance)
          });

          const created = await createJob(admin, {
            user_id: user.id,
            status: "generating_explanation",
            progress: JOB_PROGRESS.generating_explanation,
            stage: "正在调用 Qwen VL",
            language,
            image_hash: imageHash,
            quiz_answers: {},
            wrong_explanations: {}
          });

          jobId = created.id as string;

          send("meta", {
            jobId,
            status: "generating_explanation",
            progress: 40,
            stage: "正在调用 Qwen VL",
            language,
            cached: false,
            ...createGenerationAllowancePayload(allowance)
          });

          for await (const chunk of streamQwenChatCompletion(
            {
              model: QWEN_VL_MODEL,
              messages: buildFastVisionMessages({
                base64,
                mimeType,
                language
              }),
              temperature: 0.08,
              enable_thinking: false,
              max_tokens: VISION_STREAM_MAX_TOKENS
            },
            {
              firstTokenTimeoutMs: 0,
              totalTimeoutMs: STREAM_TOTAL_TIMEOUT_MS
            }
          )) {
            fullMarkdown += chunk.text;

            send("delta", {
              text: chunk.text,
              progress: 65,
              stage: "正在生成解析..."
            });
          }

          if (!fullMarkdown.trim()) {
            throw new AnalyzeStreamError("AI 没有返回有效解析内容，请稍后重试。", 503);
          }

          if (isImageNotClearMarkdown(fullMarkdown)) {
            throw new AnalyzeStreamError("图片不清晰，无法识别题目。", 422);
          }

          const originalExplanation = assertUsableOriginalExplanation(
            createOriginalExplanationFromMarkdown(fullMarkdown, language)
          );
          const detectedText = originalExplanation.detectedText;
          const ocrHash = detectedText ? createTextHash(detectedText) : null;
          const nextStatus = statusForMode(mode);

          const row = await updateJobAndReturn(admin, jobId as string, nextStatus, {
            detected_text: detectedText,
            ...(ocrHash ? { ocr_hash: ocrHash } : {}),
            original_explanation: originalExplanation,
            error_message: null
          });

          const usageLogged = await writeUsageLog({
            admin,
            userId: user.id,
            jobId,
            mode,
            action: "original_explanation",
            status: "success",
            request
          });

          const remainingCredits = usageLogged
            ? await deductGenerationCredit(admin, user.id).catch((error) => {
                console.error("stream_deduct_generation_credit_failed", error);
                return allowance.creditsRemaining;
              })
            : allowance.creditsRemaining;

          const refreshedAllowance = await getGenerationAllowance(admin, user.id).catch(() => ({
            ...allowance,
            creditsRemaining: remainingCredits,
            remainingCredits
          }));

          const [analysisRecordResult] = await Promise.allSettled([
            createLegacyAnalysisRecord({
              admin,
              userId: user.id,
              mode,
              imageUrl: null,
              originalExplanation,
              request
            })
          ]);

          void (async () => {
            const imageUrl = await uploadToStorage({
              admin,
              userId: user.id,
              file,
              buffer,
              imageHash
            });

            await Promise.allSettled([
              imageUrl
                ? admin
                    .from("analysis_jobs")
                    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
                    .eq("id", jobId)
                : Promise.resolve(),
              admin.from("uploaded_files").insert({
                user_id: user.id,
                session_id: null,
                file_name: file.name,
                file_type: file.type || "image/*",
                file_size: file.size,
                source_kind: "image",
                status: "processed",
                ip_address: getRequestMeta(request).ipAddress,
                ip_country: getRequestMeta(request).ipCountry,
                ip_region: getRequestMeta(request).ipRegion,
                ip_city: getRequestMeta(request).ipCity
              })
            ]);
          })().catch((error) => {
            console.error("stream_post_response_storage_failed", error);
          });

          send("done", {
            jobId,
            status: row.status,
            progress: row.progress,
            stage: mode === "analysis" ? row.stage : "原题解析已完成，Quiz 正在后台生成",
            language,
            cached: false,
            analysisText: fullMarkdown,
            analysisRecordId:
              analysisRecordResult.status === "fulfilled" ? analysisRecordResult.value : null,
            ...createGenerationAllowancePayload(refreshedAllowance),
            originalExplanation,
            analysis: originalExplanationToAnalysisResult(originalExplanation),
            quizResult: null,
            quiz: null
          });

          if (mode !== "analysis") {
            void generateQuizForStreamJob({
              admin,
              jobId: jobId as string,
              userId: user.id,
              mode,
              language
            });
          }
        } catch (error) {
          console.error("analyze_stream_failed", {
            jobId,
            userId: userIdForLog,
            error
          });

          const { message } = toHttpError(error);

          if (jobId) {
            await updateJobStatus(admin, jobId, "failed", {
              error_message: message
            }).catch((updateError) => {
              console.error("stream_mark_job_failed_failed", updateError);
            });
          }

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

          send("error", {
            jobId,
            status: "failed",
            progress: 100,
            stage: fullMarkdown.trim() ? "解析中断，已保留已生成内容" : "生成失败，可重试",
            errorMessage: message,
            analysisText: fullMarkdown
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    console.error("analyze_stream_preflight_failed", error);

    if (jobId) {
      const admin = createSupabaseAdminClient();
      const { message } = toHttpError(error);
      await updateJobStatus(admin, jobId, "failed", {
        error_message: message
      }).catch(() => undefined);
    }

    const { message, status } = toHttpError(error);
    return apiError(message, status);
  }
}
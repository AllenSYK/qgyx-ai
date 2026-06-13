import { NextRequest } from "next/server";
import crypto from "crypto";
import { apiError } from "@/lib/api-response";
import { getAnalysisSectionKeyFromHeading, shouldDropAnalysisLine } from "@/lib/analysisMarkdown";
import { appendFinalAnswerRules, cleanFinalAnswerChunk } from "@/lib/ai/finalAnswerMode";
import {
  JOB_PROGRESS,
  originalExplanationToAnalysisResult,
  updateJobStatus,
  type AnalysisJobStatus
} from "@/lib/analysis-jobs";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import { createOriginalExplanationFromMarkdown } from "@/lib/ai/originalExplanationFromMarkdown";
import {
  normalizeOriginalExplanationShape
} from "@/lib/ai/originalExplanationQuality";
import type { OriginalExplanation } from "@/lib/ai/schema";
import { getCurrentUser } from "@/lib/auth";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";
import { normalizeQuizMathText } from "@/lib/quiz-math";
import {
  createGenerationAllowancePayload,
  deductGenerationCredit,
  getGenerationAllowance
} from "@/lib/membership";
import { getRequestMeta } from "@/lib/request-meta";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StudyMode } from "@/types/quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
export const maxDuration = 300;

const DASHSCOPE_BASE_URL =
  process.env.DASHSCOPE_BASE_URL ||
  process.env.QWEN_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const studyModes: StudyMode[] = ["quiz", "analysis", "quiz_analysis"];
const displaySectionKeys = new Set(["question", "explanation", "answer"]);

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type AiUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

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

function getMimeFromFile(file: File) {
  return file.type || "image/jpeg";
}

function selectModel(plan: string | null) {
  if (plan === "pro" || plan === "max") {
    return process.env.QWEN_VL_PLUS_MODEL || "qwen3-vl-plus";
  }

  return process.env.QWEN_VL_FLASH_MODEL || "qwen3-vl-flash";
}

function buildSystemPrompt(language: AppLanguage) {
  const prompt = language === "en"
    ? `
You are a clear and concise problem-solving teacher.

Rules:
1. Output Markdown only, never JSON.
2. Output only the final polished explanation. Do not show thinking, trial-and-error, self-correction, checking, or internal reasoning.
3. Never write phrases like "wait", "actually", "I made a mistake", "let me check", "maybe", "recalculate", or "try another way".
4. Use exactly these three sections:
## Question
Recognize the problem. Keep the key conditions, formulas, and the actual question.

## Process
Write 3-5 short, easy-to-understand steps. Explain why each key formula or substitution is used. Keep it clear, not overly long.

## Answer
Give the final answer directly.
5. Inline formulas must use $...$; display formulas must use $$...$$.
6. Never output naked LaTeX such as \\frac{1}{2}, \\sum, \\binom, or x^{2}.
7. Do not output extra sections such as mistakes, knowledge points, similar ideas, detailed derivations, checks, verification, or recalculation.
8. If the problem is unreadable, output only: "The problem is unclear. Please upload a clearer and complete image."
`
    : `
你是一个讲解清楚、表达简洁的题目解析老师。

输出规则必须严格遵守：

1. 只输出 Markdown，不输出 JSON。
2. 只输出最终整理后的答案，不输出思考过程、试错过程、自我反驳、自我修正、检查或内部推理。
3. 禁止出现“等等、不对、刚才错了、我重新看、让我检查、可能是、前面有误、换一种思路、重新计算”等话术。
4. 结构固定为，只能有这三段：
## 题目
识别题目，保留关键条件、公式和问法。

## 过程
写 3-5 个短步骤。每一步要说明为什么这样列式或代入，让学生能看懂，但不要长篇展开。

## 答案
直接给出最终答案。
5. 行内公式必须使用 $...$，独立公式必须使用 $$...$$。
6. 禁止输出裸 LaTeX，例如不能直接输出 \\frac{1}{2}、\\sum、\\binom、x^{2}。
7. 不要输出“易错点、知识点、类似题思路、详细步骤、检查、验证、重新计算”等额外段落。
8. 如果看不清题目，只输出“题目不清晰，请重新上传更完整的题目图片。”，不要猜题。
`;
  return appendFinalAnswerRules(prompt);
}

function buildUserPrompt(language: AppLanguage) {
  if (language === "en") {
    return [
      "Recognize the problem in the image, then give a clear final answer with a simple explanation.",
      "Requirements:",
      "- Output Question first.",
      "- Do not show thinking, checking, or self-correction.",
      "- The answer must be clear.",
      "- The Process section should have 3-5 short and understandable steps.",
      "- Math formulas must be KaTeX-renderable.",
      "- Do not output JSON or code blocks.",
      "- Formulas must be wrapped in $...$ or $$...$$."
    ].join("\n");
  }

  return [
    "请识别图片中的题目，并直接给出最终答案和清晰易懂的过程。",
    "要求：",
    "- 先输出题目识别。",
    "- 不展示思考、自我检查或修正过程。",
    "- 答案必须明确。",
    "- 过程写 3-5 个短步骤，要能让学生看懂。",
    "- 数学公式必须可被 KaTeX 渲染。",
    "- 不要输出 JSON 或代码块。",
    "- 公式必须使用 $...$ 或 $$...$$ 包裹。"
  ].join("\n");
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

function sseEncode(event: string, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sseData(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function toHttpError(error: unknown) {
  if (error instanceof AnalyzeStreamError) {
    return {
      message: error.message,
      status: error.status
    };
  }

  const message = error instanceof Error ? error.message : "AI 解析失败，请稍后重试。";
  const status =
    /图片|题目不清晰|无法可靠识别|无法识别|PDF|上传/.test(message)
      ? 422
      : /API Key|模型|AI|Qwen|DashScope|超时|限流/.test(message)
        ? 503
        : 500;

  return { message, status };
}

function mapDashScopeError(status: number, rawText: string) {
  const lower = rawText.toLowerCase();

  if (status === 401 || status === 403 || /api key|apikey|unauthorized|forbidden/.test(lower)) {
    return "API Key 无效或无权限，请检查 DASHSCOPE_API_KEY。";
  }

  if (status === 404 || /model.*not.*found|model.*does.*not.*exist|模型.*不存在|not support/.test(lower)) {
    return "模型不存在或不支持图片，请确认 QWEN_VL_FLASH_MODEL / QWEN_VL_PLUS_MODEL。";
  }

  if (status === 413 || /payload too large|image.*large|图片.*大/.test(lower)) {
    return "图片太大，请压缩后重试。";
  }

  if (status === 429) {
    return "AI 服务限流，请稍后重试。";
  }

  if (status >= 500) {
    return "AI 服务暂时不可用，请稍后重试。";
  }

  return rawText || `Qwen stream failed: ${status}`;
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

async function writeUsageLog({
  admin,
  userId,
  jobId,
  mode,
  action,
  status,
  errorMessage,
  usage,
  model,
  request
}: {
  admin: AdminClient;
  userId: string;
  jobId?: string | null;
  mode: StudyMode;
  action: string;
  status: "success" | "failed";
  errorMessage?: string | null;
  usage?: AiUsage | null;
  model: string;
  request?: Request;
}) {
  try {
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
      model,
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
  language,
  model
}: {
  admin: AdminClient;
  jobId: string;
  userId: string;
  mode: StudyMode;
  language: AppLanguage;
  model: string;
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

    const originalExplanation = job.original_explanation
      ? normalizeOriginalExplanationShape(job.original_explanation as OriginalExplanation)
      : null;
    const detectedText = String(job.detected_text || originalExplanation?.detectedText || "");

    if (!originalExplanation || detectedText.replace(/\s+/g, "").length < 4) {
      throw new Error("缺少真实题干，无法继续生成 Quiz。");
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
      detectedText,
      originalExplanation,
      subject: originalExplanation.subject,
      topic: originalExplanation.topic,
      difficulty: originalExplanation.difficulty,
      questionCount: 3,
      language
    });

    await updateJobStatus(admin, jobId, "completed", {
      stage: "Quiz 已准备好",
      quiz_result: quizResult,
      error_message: null
    });

    await writeUsageLog({
      admin,
      userId,
      jobId,
      mode,
      action: "generate_quiz",
      status: "success",
      usage: null,
      model
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quiz 后台生成失败。";
    console.error("stream_generate_quiz_failed", {
      jobId,
      error: message
    });

    await updateJobStatus(admin, jobId, "failed", {
      stage: "Quiz 生成失败，可重试",
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
      errorMessage: message,
      usage: null,
      model
    });
  }
}

function finalStatusForMode(mode: StudyMode, canGenerateQuiz: boolean): AnalysisJobStatus {
  if (mode === "analysis" || !canGenerateQuiz) {
    return "completed";
  }

  return "explanation_done";
}

function extractQuestionText(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const label = line
      .replace(/^#{1,6}\s*/, "")
      .replace(/[:：]\s*$/, "")
      .trim()
      .toLowerCase();

    if (["题目", "题目识别", "识别到的题目", "question", "problem", "recognized question"].includes(label)) {
      capturing = true;
      continue;
    }

    if (
      capturing &&
      ["答案", "最终答案", "answer", "final answer", "过程", "解析", "详细解析", "explanation", "solution", "process"].includes(label)
    ) {
      break;
    }

    if (capturing) {
      output.push(line);
    }
  }

  return output.join("\n").trim();
}

function originalExplanationFromStreamMarkdown(markdown: string, language: AppLanguage) {
  const questionText = extractQuestionText(markdown);
  const parsed = createOriginalExplanationFromMarkdown(markdown, language);
  const original = normalizeOriginalExplanationShape({
    ...parsed,
    detectedText: questionText || parsed.detectedText,
    title: questionText ? questionText.replace(/\s+/g, " ").slice(0, 120) : parsed.title
  });

  return original;
}

function cleanStreamMarkdown(markdown: string, language: AppLanguage) {
  return normalizeQuizMathText(cleanFinalAnswerChunk(filterDisplayMarkdown(markdown, language))).trim();
}

function displayHeadingForKey(key: string, language: AppLanguage) {
  const isEn = language === "en";

  if (key === "question") return isEn ? "Question" : "题目";
  if (key === "explanation") return isEn ? "Process" : "过程";
  return isEn ? "Answer" : "答案";
}

function createDisplayMarkdownFilter(language: AppLanguage) {
  let droppingExtraSection = false;

  return (markdown: string) => {
    const output: string[] = [];
    const parts = String(markdown || "").match(/[^\n]*\n|[^\n]+/g) || [];

    for (const part of parts) {
      const hasNewline = part.endsWith("\n");
      const line = hasNewline ? part.slice(0, -1) : part;
      const sectionKey = getAnalysisSectionKeyFromHeading(line);

      if (sectionKey && !displaySectionKeys.has(sectionKey)) {
        droppingExtraSection = true;
        continue;
      }

      if (sectionKey && displaySectionKeys.has(sectionKey)) {
        droppingExtraSection = false;
        const level = line.match(/^\s*(#{1,6})/)?.[1] || "##";
        output.push(`${level} ${displayHeadingForKey(sectionKey, language)}${hasNewline ? "\n" : ""}`);
        continue;
      }

      if (droppingExtraSection || shouldDropAnalysisLine(line)) {
        continue;
      }

      output.push(part);
    }

    return output.join("");
  };
}

function filterDisplayMarkdown(markdown: string, language: AppLanguage) {
  return createDisplayMarkdownFilter(language)(markdown);
}

async function createUpstreamQwenStream({
  model,
  imageUrl,
  language
}: {
  model: string;
  imageUrl: string;
  language: AppLanguage;
}) {
  const upstream = await fetch(`${DASHSCOPE_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: true,
      enable_thinking: false,
      stream_options: {
        include_usage: true
      },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(language)
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserPrompt(language)
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ]
    })
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => "");
    throw new AnalyzeStreamError(mapDashScopeError(upstream.status, errorText), upstream.status || 500);
  }

  return upstream.body;
}

export async function POST(req: NextRequest) {
  if (!DASHSCOPE_API_KEY) {
    return apiError("Missing DASHSCOPE_API_KEY", 500);
  }

  let jobId: string | null = null;
  let modeForLog: StudyMode = "quiz_analysis";
  let userIdForLog: string | null = null;

  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再上传题目。", 401);
    }

    userIdForLog = user.id;

    const formData = await req.formData();
    const file = formData.get("file") || formData.get("image");
    const mode = normalizeMode(formData.get("mode"));
    const language = normalizeLanguage(formData.get("language"));
    modeForLog = mode;

    if (!file || typeof file === "string") {
      return apiError("Missing image file", 400);
    }

    if (!file.type.startsWith("image/")) {
      return apiError("流式解析仅支持图片，PDF 请使用普通解析入口。", 415);
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return apiError("图片太大，请压缩后重试。", 413);
    }

    const admin = createSupabaseAdminClient();
    const allowance = await getGenerationAllowance(admin, user.id);

    if (allowance.isBanned) {
      return apiError("账户状态异常，请联系客服处理。微信：15155132939", 403);
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageHash = createHash(buffer);
    const base64 = buffer.toString("base64");
    const mime = getMimeFromFile(file);
    const imageUrl = `data:${mime};base64,${base64}`;
    const model = selectModel(allowance.membershipLevel);

    const created = await createJob(admin, {
      user_id: user.id,
      status: "generating_explanation",
      progress: JOB_PROGRESS.generating_explanation,
      stage: "正在识别题目...",
      language,
      image_hash: imageHash,
      quiz_answers: {},
      wrong_explanations: {},
      error_message: null
    });

    jobId = created.id as string;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let fullMarkdown = "";
        let upstreamBuffer = "";
        let lineBuffer = "";
        let lastUsage: AiUsage | null = null;
        const filterDisplayDelta = createDisplayMarkdownFilter(language);

        const sendEvent = (event: string, payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(sseEncode(event, payload)));
        };

        const sendDelta = (delta: string) => {
          controller.enqueue(encoder.encode(sseData({ delta })));
        };

        const flushBufferedLines = (force = false) => {
          lineBuffer = cleanFinalAnswerChunk(lineBuffer);
          const splitIndex = lineBuffer.lastIndexOf("\n");
          const shouldFlushTail = force && lineBuffer.trim();

          if (splitIndex === -1 && !shouldFlushTail) {
            return;
          }

          const ready = splitIndex === -1 ? lineBuffer : lineBuffer.slice(0, splitIndex + 1);
          lineBuffer = splitIndex === -1 ? "" : lineBuffer.slice(splitIndex + 1);
          const delta = filterDisplayDelta(cleanFinalAnswerChunk(ready));

          if (delta) {
            fullMarkdown += delta;
            sendDelta(delta);
          }
        };

        const pushModelDelta = (text: string) => {
          if (!text) {
            return;
          }

          lineBuffer += text;
          flushBufferedLines(false);
        };

        function handleUpstreamBlock(block: string) {
          const data = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n")
            .trim();

          if (!data) {
            return;
          }

          if (data === "[DONE]") {
            return;
          }

          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                };
              }>;
              usage?: AiUsage;
            };
            pushModelDelta(json.choices?.[0]?.delta?.content || "");

            if (json.usage) {
              lastUsage = json.usage;
              sendEvent("usage", json.usage as Record<string, unknown>);
            }
          } catch {
            // Ignore malformed provider stream fragments.
          }
        }

        sendEvent("meta", {
          jobId,
          status: "generating_explanation",
          progress: 35,
          stage: "正在识别题目...",
          language,
          cached: false,
          model,
          ...createGenerationAllowancePayload(allowance)
        });

        try {
          const upstreamBody = await createUpstreamQwenStream({
            model,
            imageUrl,
            language
          });
          const reader = upstreamBody.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              upstreamBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

              const blocks = upstreamBuffer.split("\n\n");
              upstreamBuffer = blocks.pop() || "";

              for (const block of blocks) {
                handleUpstreamBlock(block);
              }
            }

            const tail = `${upstreamBuffer}${decoder.decode()}`.trim();
            if (tail) {
              handleUpstreamBlock(tail);
            }
          } finally {
            reader.releaseLock();
          }

          flushBufferedLines(true);

          if (!fullMarkdown.trim()) {
            throw new AnalyzeStreamError("AI 没有返回有效解析内容，请稍后重试。", 503);
          }

          const cleanedMarkdown = cleanStreamMarkdown(fullMarkdown, language);
          const rawQuestionText = extractQuestionText(fullMarkdown);
          const parsedOriginalExplanation = originalExplanationFromStreamMarkdown(cleanedMarkdown || fullMarkdown, language);
          const originalExplanation = rawQuestionText
            ? normalizeOriginalExplanationShape({
                ...parsedOriginalExplanation,
                detectedText: rawQuestionText,
                title: rawQuestionText.replace(/\s+/g, " ").slice(0, 120)
              })
            : parsedOriginalExplanation;
          const detectedText = rawQuestionText || originalExplanation.detectedText;
          const canGenerateQuiz = mode !== "analysis" && detectedText.replace(/\s+/g, "").length >= 4;
          const nextStatus = finalStatusForMode(mode, canGenerateQuiz);
          const ocrHash = detectedText ? createTextHash(detectedText) : null;

          const row = await updateJobAndReturn(admin, jobId as string, nextStatus, {
            status: nextStatus,
            progress: JOB_PROGRESS[nextStatus],
            stage: canGenerateQuiz ? "原题解析已完成，Quiz 正在后台生成" : "原题解析已完成",
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
            usage: lastUsage,
            model,
            request: req
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
              request: req
            })
          ]);

          void (async () => {
            const storedImageUrl = await uploadToStorage({
              admin,
              userId: user.id,
              file,
              buffer,
              imageHash
            });

            await Promise.allSettled([
              storedImageUrl
                ? admin
                    .from("analysis_jobs")
                    .update({ image_url: storedImageUrl, updated_at: new Date().toISOString() })
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
                ip_address: getRequestMeta(req).ipAddress,
                ip_country: getRequestMeta(req).ipCountry,
                ip_region: getRequestMeta(req).ipRegion,
                ip_city: getRequestMeta(req).ipCity
              })
            ]);
          })().catch((error) => {
            console.error("stream_post_response_storage_failed", error);
          });

          sendEvent("done", {
            jobId,
            status: row.status,
            progress: row.progress,
            stage: canGenerateQuiz ? "原题解析已完成，Quiz 正在后台生成" : "原题解析已完成",
            language,
            cached: false,
            model,
            analysisText: cleanedMarkdown || fullMarkdown,
            analysisRecordId:
              analysisRecordResult.status === "fulfilled" ? analysisRecordResult.value : null,
            ...createGenerationAllowancePayload(refreshedAllowance),
            originalExplanation,
            analysis: originalExplanationToAnalysisResult(originalExplanation),
            quizResult: null,
            quiz: null
          });

          if (canGenerateQuiz) {
            void generateQuizForStreamJob({
              admin,
              jobId: jobId as string,
              userId: user.id,
              mode,
              language,
              model
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
              stage: fullMarkdown.trim() ? "解析中断，已保留已生成内容" : "生成失败，可重试",
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
              usage: lastUsage,
              model,
              request: req
            });
          }

          sendEvent("error", {
            jobId,
            status: "failed",
            progress: 100,
            stage: fullMarkdown.trim() ? "解析中断，已保留已生成内容" : "生成失败，可重试",
            errorMessage: message,
            analysisText: fullMarkdown.trim() ? cleanStreamMarkdown(fullMarkdown, language) : fullMarkdown
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
        stage: "生成失败，可重试",
        error_message: message
      }).catch(() => undefined);
    }

    const { message, status } = toHttpError(error);
    return apiError(message, status);
  }
}

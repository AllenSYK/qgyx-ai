import "server-only";

export const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL ||
  process.env.DASHSCOPE_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

export const QWEN_VL_MODEL = process.env.QWEN_VL_MODEL || "qwen-vl-flash";

export const DEEPSEEK_MODEL =
  process.env.DEEPSEEK_MODEL ||
  process.env.QWEN_TEXT_MODEL ||
  "deepseek-v4-flash";

export const QWEN_TEXT_MODEL = DEEPSEEK_MODEL;

export const QWEN_QUIZ_MODEL =
  process.env.DEEPSEEK_QUIZ_MODEL ||
  process.env.QWEN_QUIZ_MODEL ||
  DEEPSEEK_MODEL;

export const QWEN_MODEL = process.env.QWEN_MODEL || QWEN_TEXT_MODEL;

export type AiTokenUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

type TextContent = {
  type: "text";
  text: string;
};

type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<TextContent | ImageContent>;
};

let lastAiUsage: AiTokenUsage | null = null;
let lastAiModel: string | null = null;

export class AiConfigurationError extends Error {
  constructor(message = "AI 服务未配置，请检查服务端模型名称和 API Key。") {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export class AiTimeoutError extends Error {
  constructor(message = "AI 请求超时。") {
    super(message);
    this.name = "AiTimeoutError";
  }
}

export class AiJsonValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiJsonValidationError";
  }
}

export function consumeLastAiUsage() {
  const usage = lastAiUsage;
  lastAiUsage = null;
  return usage;
}

export function getQwenModelName() {
  return lastAiModel || QWEN_MODEL;
}

function isQwenModel(model: string) {
  return model === QWEN_VL_MODEL || /^qwen/i.test(model);
}

function resolveProvider(model: string) {
  if (isQwenModel(model)) {
    const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;

    if (!apiKey) {
      throw new AiConfigurationError("Qwen VL 图片解析未配置，请设置 QWEN_API_KEY 或 DASHSCOPE_API_KEY。");
    }

    return {
      apiKey,
      baseUrl: QWEN_BASE_URL,
      provider: "qwen"
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new AiConfigurationError("DeepSeek 文本模型未配置，请设置 DEEPSEEK_API_KEY。");
  }

  return {
    apiKey,
    baseUrl: DEEPSEEK_BASE_URL,
    provider: "deepseek"
  };
}

export async function postQwenChatCompletion(body: Record<string, unknown>) {
  const model = typeof body.model === "string" ? body.model : QWEN_MODEL;

  if (!model.trim()) {
    throw new AiConfigurationError("AI 模型名缺失，请配置 QWEN_VL_MODEL 或 DEEPSEEK_MODEL。");
  }

  const { apiKey, baseUrl, provider } = resolveProvider(model);
  const timeoutMs = typeof body.timeoutMs === "number" ? Math.max(1000, body.timeoutMs) : 45000;
  const { timeoutMs: _timeoutMs, ...payload } = body;
  const requestPayload =
    provider === "deepseek"
      ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "enable_thinking"))
      : payload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...requestPayload,
      model
    }),
    signal: controller.signal
  }).catch((error) => {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiTimeoutError(`AI 请求超时（${Math.round(timeoutMs / 1000)} 秒）。`);
    }

    throw error;
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `AI 服务请求失败：${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    usage?: AiTokenUsage;
  };

  lastAiUsage = data.usage || null;
  lastAiModel = model;
  return data;
}

export function readAssistantText(data: { choices?: Array<{ message?: { content?: string } }> }) {
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI 服务没有返回有效内容。");
  }

  return content.trim();
}

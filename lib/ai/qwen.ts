import "server-only";

export const QWEN_BASE_URL =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const QWEN_VL_MODEL = process.env.QWEN_VL_MODEL || "qwen-vl-plus";

export const QWEN_TEXT_MODEL = process.env.QWEN_TEXT_MODEL || "deepseek-chat";

export const QWEN_QUIZ_MODEL = process.env.QWEN_QUIZ_MODEL || "deepseek-chat";

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

export class AiConfigurationError extends Error {
  constructor(message = "AI 服务未配置，请在服务端配置 DASHSCOPE_API_KEY。") {
    super(message);
    this.name = "AiConfigurationError";
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
  return QWEN_MODEL;
}

export async function postQwenChatCompletion(body: Record<string, unknown>) {
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new AiConfigurationError();
  }

  const timeoutMs = typeof body.timeoutMs === "number" ? Math.max(1000, body.timeoutMs) : 45000;
  const { timeoutMs: _timeoutMs, ...payload } = body;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  }).catch((error) => {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI 请求超时，已启用降级结果。");
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
  return data;
}

export function readAssistantText(data: { choices?: Array<{ message?: { content?: string } }> }) {
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI 服务没有返回有效内容。");
  }

  return content.trim();
}

import "server-only";

export const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL ||
  process.env.DASHSCOPE_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ||
  process.env.DASHSCOPE_BASE_URL ||
  QWEN_BASE_URL;

export const QWEN_VL_FLASH_MODEL = process.env.QWEN_VL_FLASH_MODEL || process.env.QWEN_VL_MODEL || "qwen3-vl-flash";
export const QWEN_VL_PLUS_MODEL = process.env.QWEN_VL_PLUS_MODEL || "qwen3-vl-plus";
export const QWEN_VL_MODEL = QWEN_VL_FLASH_MODEL;

export type MembershipTier = "free" | "pro" | "max";

export function getVisionModelForTier(tier: MembershipTier): string {
  switch (tier) {
    case "pro":
    case "max":
      return QWEN_VL_PLUS_MODEL;
    default:
      return QWEN_VL_FLASH_MODEL;
  }
}

export function shouldEnableThinking(tier: MembershipTier, isComplex: boolean): boolean {
  if (tier === "max" && isComplex) return true;
  return false;
}

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

export type QwenStreamChunk = {
  text: string;
  usage?: AiTokenUsage | null;
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

export class AiModelError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiModelError";
    this.status = status;
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
  return model === QWEN_VL_FLASH_MODEL || model === QWEN_VL_PLUS_MODEL || /^qwen/i.test(model);
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
      provider: "qwen" as const
    };
  }

  const useDashScopeForDeepSeek =
    /dashscope|aliyuncs/i.test(DEEPSEEK_BASE_URL) ||
    Boolean(process.env.DEEPSEEK_USE_DASHSCOPE);

  const apiKey = useDashScopeForDeepSeek
    ? process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.DEEPSEEK_API_KEY
    : process.env.DEEPSEEK_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new AiConfigurationError("DeepSeek 文本模型未配置，请设置 DASHSCOPE_API_KEY、QWEN_API_KEY 或 DEEPSEEK_API_KEY。");
  }

  return {
    apiKey,
    baseUrl: DEEPSEEK_BASE_URL,
    provider: "deepseek" as const
  };
}

function mapAiHttpError(status: number, rawText: string) {
  const text = rawText || "";
  const lower = text.toLowerCase();

  if (status === 401 || status === 403 || /invalid api key|api-key|apikey|unauthorized|forbidden/.test(lower)) {
    return "API Key 无效或无权限，请检查 QWEN_API_KEY / DASHSCOPE_API_KEY。";
  }

  if (status === 404 || /model.*not.*found|model.*does.*not.*exist|模型.*不存在|not support/.test(lower)) {
    return "模型不存在或不支持图片，请确认 QWEN_VL_FLASH_MODEL 或 QWEN_VL_PLUS_MODEL 配置是否正确。";
  }

  if (status === 413 || /payload too large|request entity too large|image.*large|图片.*大/.test(lower)) {
    return "图片太大，请压缩后重试。";
  }

  if (status === 429) {
    return "AI 服务限流，请稍后重试。";
  }

  if (status >= 500) {
    return "AI 服务暂时不可用，请稍后重试。";
  }

  return text || `AI 服务请求失败：${status}`;
}

function cleanPayloadForProvider(provider: "qwen" | "deepseek", payload: Record<string, unknown>) {
  if (provider === "deepseek") {
    return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "enable_thinking"));
  }

  return payload;
}

export async function postQwenChatCompletion(body: Record<string, unknown>) {
  const model = typeof body.model === "string" ? body.model : QWEN_MODEL;

  if (!model.trim()) {
    throw new AiConfigurationError("AI 模型名缺失，请配置 QWEN_VL_MODEL 或 DEEPSEEK_MODEL。");
  }

  const { apiKey, baseUrl, provider } = resolveProvider(model);
  const defaultTimeoutMs = provider === "qwen" ? 120000 : 60000;
  const minimumTimeoutMs = provider === "qwen" ? 45000 : 1000;
  const timeoutMs = typeof body.timeoutMs === "number" ? Math.max(minimumTimeoutMs, body.timeoutMs) : defaultTimeoutMs;
  const { timeoutMs: _timeoutMs, ...payload } = body;
  const requestPayload = cleanPayloadForProvider(provider, payload);
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
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiTimeoutError(`AI 请求超时（${Math.round(timeoutMs / 1000)} 秒）。`);
      }

      throw error;
    })
    .finally(() => clearTimeout(timer));

  if (!response.ok) {
    const errorText = await response.text();
    throw new AiModelError(mapAiHttpError(response.status, errorText), response.status);
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

export async function* streamQwenChatCompletion(
  body: Record<string, unknown>,
  options: {
    /**
     * 0 表示不启用首 token 超时。
     * 这里默认 0，逻辑和 Chatbox 更接近：只要连接建立，就耐心等模型流式输出。
     */
    firstTokenTimeoutMs?: number;
    totalTimeoutMs?: number;
  } = {}
): AsyncGenerator<QwenStreamChunk> {
  const model = typeof body.model === "string" ? body.model : QWEN_MODEL;

  if (!model.trim()) {
    throw new AiConfigurationError("AI 模型名缺失，请配置 QWEN_VL_MODEL 或 DEEPSEEK_MODEL。");
  }

  const { apiKey, baseUrl, provider } = resolveProvider(model);

  const rawFirstTokenTimeoutMs = options.firstTokenTimeoutMs ?? 0;
  const firstTokenTimeoutMs =
    rawFirstTokenTimeoutMs <= 0 ? 0 : Math.max(30000, rawFirstTokenTimeoutMs);

  const totalTimeoutMs = Math.max(
    firstTokenTimeoutMs || 0,
    options.totalTimeoutMs ?? (provider === "qwen" ? 180000 : 90000)
  );

  const { timeoutMs: _timeoutMs, ...payload } = body;
  const requestPayload = cleanPayloadForProvider(provider, payload);
  const controller = new AbortController();

  let receivedFirstToken = false;
  let firstTokenTimedOut = false;
  let totalTimedOut = false;

  lastAiModel = model;
  lastAiUsage = null;

  let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;

  if (firstTokenTimeoutMs > 0) {
    firstTokenTimer = setTimeout(() => {
      firstTokenTimedOut = true;
      controller.abort();
    }, firstTokenTimeoutMs);
  }

  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    controller.abort();
  }, totalTimeoutMs);

  let response: Response;

  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...requestPayload,
        model,
        stream: true
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);

    if (error instanceof Error && error.name === "AbortError") {
      if (firstTokenTimedOut) {
        throw new AiTimeoutError(`模型首 token 超时（${Math.round(firstTokenTimeoutMs / 1000)} 秒）。`);
      }

      if (totalTimedOut) {
        throw new AiTimeoutError(`模型响应超时（${Math.round(totalTimeoutMs / 1000)} 秒）。`);
      }
    }

    throw error;
  }

  if (!response.ok) {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
    const errorText = await response.text();
    throw new AiModelError(mapAiHttpError(response.status, errorText), response.status);
  }

  if (!response.body) {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
    throw new Error("AI 服务未返回可读取的流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function parseBlock(block: string) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (!data || data === "[DONE]") {
      return null;
    }

    try {
      return JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string;
          };
          message?: {
            content?: string;
          };
        }>;
        usage?: AiTokenUsage;
      };
    } catch {
      return null;
    }
  }

  function getParsedText(parsed: {
    choices?: Array<{
      delta?: {
        content?: string;
      };
      message?: {
        content?: string;
      };
    }>;
  }) {
    return parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || "";
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      while (true) {
        const boundary = buffer.indexOf("\n\n");

        if (boundary === -1) {
          break;
        }

        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);

        if (!parsed) {
          continue;
        }

        if (parsed.usage) {
          lastAiUsage = parsed.usage;
        }

        const text = getParsedText(parsed);

        if (text) {
          if (!receivedFirstToken) {
            receivedFirstToken = true;
            if (firstTokenTimer) clearTimeout(firstTokenTimer);
          }

          yield {
            text,
            usage: parsed.usage || null
          };
        }
      }
    }

    const tail = buffer.trim();
    const parsedTail = tail ? parseBlock(tail) : null;
    const tailText = parsedTail ? getParsedText(parsedTail) : "";

    if (parsedTail?.usage) {
      lastAiUsage = parsedTail.usage;
    }

    if (tailText) {
      if (!receivedFirstToken) {
        receivedFirstToken = true;
        if (firstTokenTimer) clearTimeout(firstTokenTimer);
      }

      yield {
        text: tailText,
        usage: parsedTail?.usage || null
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (firstTokenTimedOut && !receivedFirstToken) {
        throw new AiTimeoutError(`模型首 token 超时（${Math.round(firstTokenTimeoutMs / 1000)} 秒）。`);
      }

      if (totalTimedOut) {
        throw new AiTimeoutError(`模型响应超时（${Math.round(totalTimeoutMs / 1000)} 秒）。`);
      }
    }

    throw error;
  } finally {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
    reader.releaseLock();
  }
}

export async function collectQwenStreamText(
  body: Record<string, unknown>,
  options: {
    firstTokenTimeoutMs?: number;
    totalTimeoutMs?: number;
  } = {}
) {
  let text = "";

  for await (const chunk of streamQwenChatCompletion(body, options)) {
    text += chunk.text;
  }

  if (!text.trim()) {
    throw new Error("AI 服务没有返回有效内容。");
  }

  return text.trim();
}

export function readAssistantText(data: { choices?: Array<{ message?: { content?: string } }> }) {
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI 服务没有返回有效内容。");
  }

  return content.trim();
}

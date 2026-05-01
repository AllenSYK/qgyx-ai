import "server-only";

import type { z } from "zod";
import { extractJsonFromText } from "@/lib/ai/extractJson";
import { AiJsonValidationError, postQwenChatCompletion, QWEN_TEXT_MODEL, readAssistantText } from "@/lib/ai/qwen";
import { fixLatex } from "@/lib/latex";

export type ParseResult<T> =
  | {
      success: true;
      data: T;
      jsonText: string;
      repaired: boolean;
    }
  | {
      success: false;
      error: string;
      jsonText: string;
      repaired: boolean;
    };

function normalizeJsonText(input: string) {
  return input
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

const LATEX_COMMANDS = /^(frac|sqrt|pi|int|ln|log|cosh|sinh|tanh|cos|sin|tan|left|right|sum|lim|theta|alpha|beta|gamma|Delta)\b/;

function repairJsonStringContent(input: string) {
  let output = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (!inString) {
      if (char === "\"") {
        inString = true;
      }
      output += char;
      continue;
    }

    if (escaping) {
      escaping = false;
      output += char;
      continue;
    }

    if (char === "\\") {
      const rest = input.slice(index + 1);
      const next = input[index + 1] || "";

      if (LATEX_COMMANDS.test(rest) || !["\"", "\\", "/", "b", "f", "n", "r", "t", "u"].includes(next)) {
        output += "\\\\";
        continue;
      }

      escaping = true;
      output += char;
      continue;
    }

    if (char === "\n" || char === "\r") {
      output += "\\n";
      continue;
    }

    if (char === "\t") {
      output += "\\t";
      continue;
    }

    if (char === "\"") {
      const rest = input.slice(index + 1);
      const nextNonSpace = rest.match(/\S/)?.[0] || "";

      if (nextNonSpace && ![":", ",", "}", "]"].includes(nextNonSpace)) {
        output += "\\\"";
        continue;
      }

      inString = false;
    }

    output += char;
  }

  return output;
}

export function repairJson(raw: string) {
  return repairJsonStringContent(
    normalizeJsonText(extractJsonFromText(raw))
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/,\s*([}\]])/g, "$1")
  );
}

const ARRAY_FIELD_LIMITS = {
  keySteps: 4,
  knowledgePoints: 4,
  similarIdeas: 3,
  questions: 4,
  options: 4,
  commonMistakes: 6,
  suggestions: 6,
  steps: 6,
  formulas: 8,
  warnings: 4
} as const;

function arrayItemToString(item: unknown) {
  if (typeof item === "string") {
    return item.trim();
  }

  if (typeof item === "number" || typeof item === "boolean" || typeof item === "bigint") {
    return String(item);
  }

  if (item && typeof item === "object") {
    try {
      return JSON.stringify(item);
    } catch {
      return "";
    }
  }

  return "";
}

function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(arrayItemToString)
    .map(fixLatex)
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function normalizeQuestionArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, ARRAY_FIELD_LIMITS.questions).map((item) => normalizeAiJsonValue(item));
}

function normalizeAiJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAiJsonValue(item));
  }

  if (typeof value === "string") {
    return fixLatex(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (key === "questions") {
      normalized[key] = normalizeQuestionArray(item);
      continue;
    }

    if (key === "keySteps") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.keySteps);
      continue;
    }

    if (key === "knowledgePoints") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.knowledgePoints);
      continue;
    }

    if (key === "similarIdeas") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.similarIdeas);
      continue;
    }

    if (key === "options") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.options);
      continue;
    }

    if (key === "commonMistakes") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.commonMistakes);
      continue;
    }

    if (key === "suggestions") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.suggestions);
      continue;
    }

    if (key === "steps") {
      normalized[key] = normalizeStepsArray(item);
      continue;
    }

    if (key === "formulas") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.formulas);
      continue;
    }

    if (key === "warnings") {
      normalized[key] = normalizeStringArray(item, ARRAY_FIELD_LIMITS.warnings);
      continue;
    }

    normalized[key] = normalizeAiJsonValue(item);
  }

  return normalized;
}

function normalizeStepsArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, ARRAY_FIELD_LIMITS.steps)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      return {
        title: typeof obj.title === "string" ? fixLatex(obj.title) : "",
        content: typeof obj.content === "string" ? fixLatex(obj.content) : "",
        formula: typeof obj.formula === "string" ? fixLatex(obj.formula) : ""
      };
    })
    .filter((s): s is { title: string; content: string; formula: string } => s !== null && s.title.length > 0 && s.content.length > 0);
}

function isBlankString(value: unknown) {
  return typeof value === "string" && value.trim().length === 0;
}

function schemaNormalizeWithFallback(value: unknown, fallback: unknown): unknown {
  const normalized = normalizeAiJsonValue(value);

  if (Array.isArray(fallback)) {
    return Array.isArray(normalized) && normalized.length > 0 ? normalized : fallback;
  }

  if (!fallback || typeof fallback !== "object" || !normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return isBlankString(normalized) ? fallback : normalized ?? fallback;
  }

  const merged: Record<string, unknown> = { ...(normalized as Record<string, unknown>) };

  for (const [key, fallbackValue] of Object.entries(fallback as Record<string, unknown>)) {
    const current = merged[key];

    if (current === undefined || current === null || isBlankString(current)) {
      merged[key] = fallbackValue;
      continue;
    }

    if (Array.isArray(fallbackValue) && (!Array.isArray(current) || current.length === 0)) {
      merged[key] = fallbackValue;
      continue;
    }

    if (fallbackValue && typeof fallbackValue === "object" && current && typeof current === "object") {
      merged[key] = schemaNormalizeWithFallback(current, fallbackValue);
    }
  }

  return merged;
}

function parseJsonSafely(text: string) {
  try {
    return {
      success: true as const,
      data: JSON.parse(text) as unknown
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "JSON.parse failed"
    };
  }
}

function validateNormalized<T>(value: unknown, schema: z.ZodType<T>, fallback?: T) {
  const normalized = fallback === undefined ? normalizeAiJsonValue(value) : schemaNormalizeWithFallback(value, fallback);
  return schema.safeParse(normalized);
}

function tryParseAndValidate<T>(raw: string, schema: z.ZodType<T>, repaired: boolean): ParseResult<T> {
  const jsonText = repaired ? repairJson(raw) : normalizeJsonText(extractJsonFromText(raw));
  const parsed = parseJsonSafely(jsonText);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error,
      jsonText,
      repaired
    };
  }

  const validated = validateNormalized(parsed.data, schema);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; "),
      jsonText,
      repaired
    };
  }

  return {
    success: true,
    data: validated.data,
    jsonText,
    repaired
  };
}

export async function robustParseAiJson<T>(rawText: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const candidates = [
    normalizeJsonText(extractJsonFromText(rawText)),
    repairJson(rawText)
  ];

  for (const [index, candidate] of candidates.entries()) {
    const parsed = parseJsonSafely(candidate);

    if (!parsed.success) {
      continue;
    }

    const validated = validateNormalized(parsed.data, schema, fallback);

    if (validated.success) {
      return validated.data;
    }

    if (index === candidates.length - 1) {
      const normalizedFallback = validateNormalized(schemaNormalizeWithFallback(parsed.data, fallback), schema, fallback);

      if (normalizedFallback.success) {
        return normalizedFallback.data;
      }
    }
  }

  return fallback;
}

export async function repairJsonWithAI(raw: string, error: string, schemaDescription: string) {
  const data = await postQwenChatCompletion({
    model: QWEN_TEXT_MODEL,
    messages: [
      {
        role: "system",
        content: "你是 JSON 修复器。只允许输出严格合法 JSON，不要 Markdown，不要 ```json，不要代码块，不要解释。"
      },
      {
        role: "user",
        content: `下面内容不是合法 JSON 或不符合 schema。请修复为严格合法 JSON，并且只输出 JSON。

修复要求：
1. 字符串内双引号必须转义。
2. 字符串内换行必须写成 \\n。
3. LaTeX 反斜杠必须双写，例如 \\frac、\\sqrt、\\pi、\\int、\\ln、\\cosh、\\sinh。
4. 删除尾随逗号。
5. 保留中文内容，不要改写语义。

错误信息：
${error}

目标 JSON 结构：
${schemaDescription}

待修复内容：
${raw}`
      }
    ],
    temperature: 0.1,
    enable_thinking: false,
    max_tokens: 2200,
    timeoutMs: 30000
  });

  return readAssistantText(data);
}

export async function parseAndValidateJson<T>(
  raw: string,
  schema: z.ZodType<T>,
  schemaDescription: string
): Promise<ParseResult<T>> {
  const first = tryParseAndValidate(raw, schema, false);

  if (first.success) {
    return first;
  }

  const locallyRepaired = tryParseAndValidate(raw, schema, true);

  if (locallyRepaired.success) {
    return locallyRepaired;
  }

  try {
    const repairedRaw = await repairJsonWithAI(raw, locallyRepaired.error || first.error, schemaDescription);
    const repaired = tryParseAndValidate(repairedRaw, schema, true);

    if (repaired.success) {
      return repaired;
    }

    return {
      ...repaired,
      error: `JSON 修复后仍不符合格式：${repaired.error}`
    };
  } catch (error) {
    return {
      success: false,
      error: `JSON 修复失败：${error instanceof Error ? error.message : first.error}`,
      jsonText: first.jsonText,
      repaired: true
    };
  }
}

export function assertParsed<T>(result: ParseResult<T>): T {
  if (!result.success) {
    throw new AiJsonValidationError(result.error);
  }

  return result.data;
}

const MAX_REPAIR_RETRIES = Number(process.env.AI_MAX_REPAIR_RETRY || 2);

export async function repairAIJson<T>(
  rawOutput: string,
  schema: z.ZodType<T>,
  schemaDescription: string,
  fallback: T
): Promise<T> {
  const firstAttempt = await parseAndValidateJson(rawOutput, schema, schemaDescription);
  if (firstAttempt.success) return firstAttempt.data;

  for (let retry = 0; retry < MAX_REPAIR_RETRIES; retry++) {
    try {
      const repairedRaw = await repairJsonWithAI(
        rawOutput,
        firstAttempt.error,
        schemaDescription
      );
      const result = await parseAndValidateJson(repairedRaw, schema, schemaDescription);
      if (result.success) return result.data;
    } catch {
      continue;
    }
  }

  console.warn("repairAIJson: all retries exhausted, returning fallback");
  return fallback;
}

export function safeFallbackJson<T>(fallback: T): T {
  return fallback;
}

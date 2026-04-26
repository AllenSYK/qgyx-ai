import "server-only";

import type { Quiz, QuizQuestion, ReviewResult, WrongQuestion } from "@/types/quiz";

const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

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

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<TextContent | ImageContent>;
};

export class AiJsonFormatError extends Error {
  constructor(message = "AI 返回格式暂时不稳定，请重新生成一次。") {
    super(message);
    this.name = "AiJsonFormatError";
  }
}

async function postChatCompletion({
  baseUrl,
  apiKey,
  body
}: {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `AI 服务请求失败：${response.status}`);
  }

  return response.json() as Promise<{
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  }>;
}

function readAssistantText(data: { choices?: Array<{ message?: { content?: string } }> }) {
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI 服务没有返回有效内容。");
  }

  return content.trim();
}

function parseJsonObject<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as T;
      } catch {
        throw new AiJsonFormatError();
      }
    }

    throw new AiJsonFormatError();
  }
}

function normalizeQuestion(input: unknown): QuizQuestion {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<QuizQuestion>;
  const options = Array.isArray(value.options)
    ? value.options.map((option) => String(option)).slice(0, 4)
    : [];

  if (
    typeof value.question !== "string" ||
    typeof value.explanation !== "string" ||
    typeof value.answerIndex !== "number" ||
    options.length !== 4 ||
    value.answerIndex < 0 ||
    value.answerIndex > 3
  ) {
    throw new AiJsonFormatError();
  }

  return {
    question: value.question,
    options,
    answerIndex: value.answerIndex,
    explanation: value.explanation
  };
}

function normalizeQuiz(input: unknown): Quiz {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<Quiz>;

  if (
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.questions) ||
    value.questions.length === 0
  ) {
    throw new AiJsonFormatError();
  }

  return {
    title: value.title,
    summary: value.summary,
    questions: value.questions.map(normalizeQuestion)
  };
}

function normalizeReview(input: unknown): ReviewResult {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<ReviewResult>;

  if (
    typeof value.weaknessSummary !== "string" ||
    !Array.isArray(value.mistakeAnalysis) ||
    !Array.isArray(value.reviewNotes) ||
    !Array.isArray(value.practiceQuestions)
  ) {
    throw new AiJsonFormatError();
  }

  return {
    weaknessSummary: value.weaknessSummary,
    mistakeAnalysis: value.mistakeAnalysis.map((item) => {
      const mistake = item as Partial<ReviewResult["mistakeAnalysis"][number]>;
      if (
        !mistake ||
        typeof mistake.question !== "string" ||
        typeof mistake.userMistake !== "string" ||
        typeof mistake.correctThinking !== "string" ||
        typeof mistake.keyPoint !== "string"
      ) {
        throw new AiJsonFormatError();
      }

      return {
        question: mistake.question,
        userMistake: mistake.userMistake,
        correctThinking: mistake.correctThinking,
        keyPoint: mistake.keyPoint
      };
    }),
    reviewNotes: value.reviewNotes.map((note) => String(note)),
    practiceQuestions: value.practiceQuestions.map(normalizeQuestion).slice(0, 3)
  };
}

export async function analyzeImageWithQwen({
  base64,
  mimeType
}: {
  base64: string;
  mimeType: string;
}) {
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY 未配置。");
  }

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请详细分析这张图片中的学习内容。
如果是题目，请提取：
1. 题干
2. 所有文字
3. 图形/表格/函数图/几何图信息
4. 已知条件
5. 可能考察的知识点
请用中文输出，不要遗漏图形信息。`
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

  const data = await postChatCompletion({
    baseUrl: QWEN_BASE_URL,
    apiKey,
    body: {
      model: "qwen3-vl-plus",
      messages,
      temperature: 0.2
    }
  });

  return readAssistantText(data);
}

export async function generateQuizFromAnalysis(analysisText: string): Promise<Quiz> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置。");
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是严谨的中文学习测验生成器。只能输出一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。"
    },
    {
      role: "user",
      content: `根据下面的图片分析内容生成交互测验。要求：
1. 只输出严格 JSON。
2. 生成 3 到 5 道题。
3. 每题必须有 4 个选项。
4. answerIndex 必须是 0、1、2、3 之一。
5. 解析必须清楚说明原因。

JSON 结构必须是：
{
  "title": "测验标题",
  "summary": "内容总结",
  "questions": [
    {
      "question": "题目",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answerIndex": 0,
      "explanation": "解析"
    }
  ]
}

图片分析内容：
${analysisText}`
    }
  ];

  const data = await postChatCompletion({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey,
    body: {
      model: "deepseek-v4-flash",
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" }
    }
  });

  const raw = readAssistantText(data);
  return normalizeQuiz(parseJsonObject<Quiz>(raw));
}

export async function generateReviewFromMistakes({
  originalAnalysisText,
  wrongQuestions
}: {
  originalAnalysisText: string;
  wrongQuestions: WrongQuestion[];
}): Promise<ReviewResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置。");
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文学习错题巩固教练。只能输出一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。"
    },
    {
      role: "user",
      content: `请根据原始图片分析和用户错题，生成错题巩固内容。暂时不要扣次数。

必须输出严格 JSON：
{
  "weaknessSummary": "薄弱点总结",
  "mistakeAnalysis": [
    {
      "question": "错题题目",
      "userMistake": "用户为什么可能选错",
      "correctThinking": "正确思路",
      "keyPoint": "核心知识点"
    }
  ],
  "reviewNotes": [
    "巩固笔记1",
    "巩固笔记2"
  ],
  "practiceQuestions": [
    {
      "question": "相似练习题",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answerIndex": 0,
      "explanation": "解析"
    }
  ]
}

原始图片分析：
${originalAnalysisText}

用户错题：
${JSON.stringify(wrongQuestions, null, 2)}`
    }
  ];

  const data = await postChatCompletion({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey,
    body: {
      model: "deepseek-v4-flash",
      messages,
      temperature: 0.25,
      response_format: { type: "json_object" }
    }
  });

  const raw = readAssistantText(data);
  return normalizeReview(parseJsonObject<ReviewResult>(raw));
}

import "server-only";

import type { Quiz, QuizQuestion, ReviewResult, WrongQuestion } from "@/types/quiz";

const QWEN_BASE_URL =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3.6-plus";

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
  body
}: {
  body: Record<string, unknown>;
}) {
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY 未配置。");
  }

  const response = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `千问服务请求失败：${response.status}`);
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

function normalizeDifficulty(value: unknown): QuizQuestion["difficulty"] {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  return "medium";
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
    explanation: value.explanation,
    knowledgePoint:
      typeof value.knowledgePoint === "string" && value.knowledgePoint.trim()
        ? value.knowledgePoint
        : "核心知识点",
    difficulty: normalizeDifficulty(value.difficulty)
  };
}

function normalizeQuiz(input: unknown, sourceType: Quiz["sourceType"]): Quiz {
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
    subject: typeof value.subject === "string" ? value.subject : undefined,
    questionType: typeof value.questionType === "string" ? value.questionType : undefined,
    sourceType,
    questions: value.questions.map(normalizeQuestion).slice(0, 3)
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
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请详细识别这张学习题目图片，并只做“生成同类型新题”所需的分析。

请用中文输出，重点提取：
1. 学科
2. 题型
3. 核心知识点
4. 解题方法或关键公式
5. 原题结构
6. 变量、数字、图形条件、表格条件、函数图或几何图信息
7. 容易出错的点

如果包含数学内容，请尽量使用 LaTeX 表达公式，例如 $x^2+2x+1$ 或 $$S=\\frac{1}{2}ah$$。
不要遗漏图形、表格、函数图、几何图、物理图中的关键信息。`
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
    body: {
      model: QWEN_MODEL,
      messages,
      temperature: 0.15
    }
  });

  return readAssistantText(data);
}

export async function analyzePdfTextWithDeepSeek(text: string) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文学习材料分析助手。你只分析文档结构、知识点和可出题方向，不要生成题目。"
    },
    {
      role: "user",
      content: `请分析下面 PDF 文档内容，用于后续生成同类型练习题和章节 Quiz。

请输出中文分析，包含：
1. 学科
2. 章节或主题
3. 核心知识点列表
4. 常见题型
5. 关键公式或方法，数学公式请使用 LaTeX
6. 适合生成的 Quiz 方向

PDF 文本内容：
${text.slice(0, 18000)}`
    }
  ];

  const data = await postChatCompletion({
    body: {
      model: QWEN_MODEL,
      messages,
      temperature: 0.2
    }
  });

  return readAssistantText(data);
}

export async function generateQuizFromAnalysis(
  analysisText: string,
  options: {
    sourceType?: Quiz["sourceType"];
    questionCount?: number;
  } = {}
): Promise<Quiz> {
  const questionCount = options.questionCount ?? 3;
  const sourceType = options.sourceType ?? "image";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文考试练习题生成器。你不是在解析原题给用户看，而是根据原题的题型、考点、解法生成新的同类型练习题。只能输出合法 JSON 对象，不要输出 Markdown、代码块或额外说明。"
    },
    {
      role: "user",
      content: `请根据下面的材料分析生成 ${questionCount} 道“同类型新题”。

核心要求：
1. 不要复述原题，不要拆解原题，不要把原题改写成解析题。
2. 新题必须像真实考试/练习题。
3. 新题与原题考点相同，解法相同或相近。
4. 必须更换数字、条件、题干表达和答案。
5. 不要照抄原题中的完整句子、数字组合或选项。
6. 如果是数学题，题干、选项和解析中的公式尽量使用 LaTeX，例如 $x^2-4x+3=0$、$\\frac{1}{2}$、$$A=\\pi r^2$$。
7. 每题必须有 4 个选项，answerIndex 必须是 0、1、2、3。
8. difficulty 只能是 easy / medium / hard。
9. 默认生成 3 道题，不要多于 3 道。

必须输出严格 JSON：
{
  "title": "同类型练习标题",
  "summary": "简要说明这组题训练的考点，不要暴露原题答案",
  "subject": "学科",
  "questionType": "题型",
  "questions": [
    {
      "question": "新题题干",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answerIndex": 0,
      "explanation": "清晰解析",
      "knowledgePoint": "知识点",
      "difficulty": "medium"
    }
  ]
}

材料分析：
${analysisText}`
    }
  ];

  const data = await postChatCompletion({
    body: {
      model: QWEN_MODEL,
      messages,
      temperature: 0.45,
      response_format: { type: "json_object" }
    }
  });

  const raw = readAssistantText(data);
  return normalizeQuiz(parseJsonObject<Quiz>(raw), sourceType);
}

export async function generateReviewFromMistakes({
  originalAnalysisText,
  wrongQuestions
}: {
  originalAnalysisText: string;
  wrongQuestions: WrongQuestion[];
}): Promise<ReviewResult> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文学习错题巩固教练。只能输出一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。"
    },
    {
      role: "user",
      content: `请根据原始材料分析和用户错题，生成错题巩固内容。

要求：
1. 指出薄弱点、错因和正确思路。
2. 生成 3 道新的相似练习题，不能复述原错题。
3. 数学内容尽量使用 LaTeX。
4. practiceQuestions 中每题必须包含 question、options、answerIndex、explanation、knowledgePoint、difficulty。

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
      "explanation": "解析",
      "knowledgePoint": "知识点",
      "difficulty": "medium"
    }
  ]
}

原始材料分析：
${originalAnalysisText}

用户错题：
${JSON.stringify(wrongQuestions, null, 2)}`
    }
  ];

  const data = await postChatCompletion({
    body: {
      model: QWEN_MODEL,
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" }
    }
  });

  const raw = readAssistantText(data);
  return normalizeReview(parseJsonObject<ReviewResult>(raw));
}

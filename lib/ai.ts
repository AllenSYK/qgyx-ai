import "server-only";

import type { Quiz, QuizQuestion, ReviewResult, WrongQuestion } from "@/types/quiz";

const QWEN_BASE_URL =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

const QWEN_MODEL = process.env.QWEN_MODEL || "qwen-vl-plus";

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

async function postQwenChatCompletion(body: Record<string, unknown>) {
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

function extractJsonText(raw: string) {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^[\s\S]*?(?=\{)/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new AiJsonFormatError();
  }

  return cleaned.slice(start, end + 1);
}

function parseJsonObject<T>(raw: string): T {
  const jsonText = extractJsonText(raw);

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    try {
      const repaired = jsonText
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");
      return JSON.parse(repaired) as T;
    } catch {
      throw new AiJsonFormatError();
    }
  }
}

function normalizeDifficulty(value: unknown): QuizQuestion["difficulty"] {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  return "medium";
}

function normalizeOptions(input: unknown): string[] {
  const options = Array.isArray(input) ? input.map((item) => String(item)) : [];

  while (options.length < 4) {
    options.push(`选项${String.fromCharCode(65 + options.length)}`);
  }

  return options.slice(0, 4);
}

function normalizeAnswerIndex(value: unknown) {
  if (typeof value === "number" && value >= 0 && value <= 3) {
    return value;
  }

  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (upper === "A") return 0;
    if (upper === "B") return 1;
    if (upper === "C") return 2;
    if (upper === "D") return 3;

    const parsed = Number(upper);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 3) {
      return parsed;
    }
  }

  return 0;
}

function normalizeQuestion(input: unknown): QuizQuestion {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<QuizQuestion>;
  const question = typeof value.question === "string" && value.question.trim() ? value.question : "根据材料生成的同类型练习题";
  const options = normalizeOptions(value.options);
  const answerIndex = normalizeAnswerIndex(value.answerIndex);
  const explanation =
    typeof value.explanation === "string" && value.explanation.trim()
      ? value.explanation
      : "本题考查同类型知识点，请根据题干条件进行推理。";

  return {
    question,
    options,
    answerIndex,
    explanation,
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
  const rawQuestions = Array.isArray(value.questions) ? value.questions : [];

  if (rawQuestions.length === 0) {
    throw new AiJsonFormatError();
  }

  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title : "同类型练习",
    summary:
      typeof value.summary === "string" && value.summary.trim()
        ? value.summary
        : "这组题用于训练与原题相同或相近的核心考点。",
    subject: typeof value.subject === "string" ? value.subject : undefined,
    questionType: typeof value.questionType === "string" ? value.questionType : undefined,
    sourceType,
    questions: rawQuestions.map(normalizeQuestion).slice(0, 3)
  };
}

function normalizeReview(input: unknown): ReviewResult {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<ReviewResult>;

  return {
    weaknessSummary:
      typeof value.weaknessSummary === "string" && value.weaknessSummary.trim()
        ? value.weaknessSummary
        : "主要薄弱点集中在题型识别、关键条件提取和解题步骤判断。",
    mistakeAnalysis: Array.isArray(value.mistakeAnalysis)
      ? value.mistakeAnalysis.map((item) => {
          const mistake = item as Partial<ReviewResult["mistakeAnalysis"][number]>;

          return {
            question: typeof mistake.question === "string" ? mistake.question : "错题",
            userMistake: typeof mistake.userMistake === "string" ? mistake.userMistake : "可能没有准确识别关键条件。",
            correctThinking:
              typeof mistake.correctThinking === "string" ? mistake.correctThinking : "应先提取题干条件，再套用对应方法。",
            keyPoint: typeof mistake.keyPoint === "string" ? mistake.keyPoint : "核心知识点"
          };
        })
      : [],
    reviewNotes: Array.isArray(value.reviewNotes) ? value.reviewNotes.map((note) => String(note)) : [],
    practiceQuestions: Array.isArray(value.practiceQuestions)
      ? value.practiceQuestions.map(normalizeQuestion).slice(0, 3)
      : []
  };
}

async function repairQuizWithQwen(raw: string, sourceType: Quiz["sourceType"]): Promise<Quiz> {
  const data = await postQwenChatCompletion({
    model: QWEN_MODEL,
    messages: [
      {
        role: "system",
        content: "你是 JSON 修复器。只能输出合法 JSON，不要解释。"
      },
      {
        role: "user",
        content: `请把下面内容修复成严格 JSON，结构必须是：
{
  "title": "标题",
  "summary": "总结",
  "subject": "学科",
  "questionType": "题型",
  "questions": [
    {
      "question": "题目",
      "options": ["A", "B", "C", "D"],
      "answerIndex": 0,
      "explanation": "解析",
      "knowledgePoint": "知识点",
      "difficulty": "medium"
    }
  ]
}

要求：
1. questions 必须有 3 道。
2. 每题必须 4 个选项。
3. answerIndex 必须是 0、1、2、3。
4. difficulty 只能是 easy / medium / hard。
5. 只输出 JSON。

待修复内容：
${raw}`
      }
    ],
    temperature: 0.1,
    enable_thinking: false,
    max_tokens: 1800
  });

  const repaired = readAssistantText(data);
  return normalizeQuiz(parseJsonObject<Quiz>(repaired), sourceType);
}

async function parseQuizWithRepair(raw: string, sourceType: Quiz["sourceType"]) {
  try {
    return normalizeQuiz(parseJsonObject<Quiz>(raw), sourceType);
  } catch {
    return repairQuizWithQwen(raw, sourceType);
  }
}

export async function generateQuizFromImageWithQwen({
  base64,
  mimeType,
  questionCount = 3
}: {
  base64: string;
  mimeType: string;
  questionCount?: number;
}): Promise<Quiz> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文考试练习题生成器。你必须根据用户上传的题目图片，直接生成新的同类型练习题。只能输出 JSON，不要 Markdown，不要解释。"
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请识别图片中的原题，并直接生成 ${questionCount} 道“同类型新题”。

严格要求：
1. 不要复述原题。
2. 不要拆解原题。
3. 不要把原题改写成解析题。
4. 新题必须像真实考试/练习题。
5. 新题与原题考点相同，解法相同或相近。
6. 必须更换数字、条件、题干表达和答案。
7. 不要照抄原题中的完整句子、数字组合或选项。
8. 如果有图形、表格、函数图、几何图、物理图，请根据图中关键信息生成同类型新题。
9. 数学公式尽量使用 LaTeX，例如 $x^2-4x+3=0$、$\\frac{1}{2}$、$$A=\\pi r^2$$。
10. 每题必须有 4 个选项。
11. answerIndex 必须是 0、1、2、3。
12. difficulty 只能是 easy / medium / hard。
13. 必须生成 3 道题。

只输出这个 JSON 结构：
{
  "title": "同类型练习标题",
  "summary": "简要说明这组题训练的考点",
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
}`
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

  const data = await postQwenChatCompletion({
    model: QWEN_MODEL,
    messages,
    temperature: 0.25,
    enable_thinking: false,
    max_tokens: 1800
  });

  const raw = readAssistantText(data);
  return parseQuizWithRepair(raw, "image");
}

export async function generateQuizFromPdfTextWithQwen({
  text,
  questionCount = 3
}: {
  text: string;
  questionCount?: number;
}): Promise<Quiz> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文考试练习题生成器。你必须根据用户上传的 PDF 文本内容，直接生成新的同类型练习题。只能输出 JSON，不要 Markdown，不要解释。"
    },
    {
      role: "user",
      content: `请根据下面 PDF 内容直接生成 ${questionCount} 道“同类型新题”。

严格要求：
1. 不要复述原文。
2. 不要拆解原文。
3. 新题必须像真实考试/练习题。
4. 新题要围绕 PDF 中的核心知识点。
5. 公式尽量使用 LaTeX。
6. 每题必须有 4 个选项。
7. answerIndex 必须是 0、1、2、3。
8. difficulty 只能是 easy / medium / hard。
9. 必须生成 3 道题。

只输出这个 JSON 结构：
{
  "title": "同类型练习标题",
  "summary": "简要说明这组题训练的考点",
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

PDF 文本内容：
${text.slice(0, 10000)}`
    }
  ];

  const data = await postQwenChatCompletion({
    model: QWEN_MODEL,
    messages,
    temperature: 0.25,
    enable_thinking: false,
    max_tokens: 1800
  });

  const raw = readAssistantText(data);
  return parseQuizWithRepair(raw, "pdf");
}

export async function analyzeImageWithQwen({
  base64,
  mimeType
}: {
  base64: string;
  mimeType: string;
}) {
  const quiz = await generateQuizFromImageWithQwen({
    base64,
    mimeType,
    questionCount: 3
  });

  return JSON.stringify(quiz);
}

export async function analyzePdfTextWithDeepSeek(text: string) {
  const quiz = await generateQuizFromPdfTextWithQwen({
    text,
    questionCount: 3
  });

  return JSON.stringify(quiz);
}

export async function generateQuizFromAnalysis(
  analysisText: string,
  options: {
    sourceType?: Quiz["sourceType"];
    questionCount?: number;
  } = {}
): Promise<Quiz> {
  const sourceType = options.sourceType ?? "image";
  return parseQuizWithRepair(analysisText, sourceType);
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
      content: `请根据原始材料和用户错题，生成错题巩固内容。

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

原始材料：
${originalAnalysisText}

用户错题：
${JSON.stringify(wrongQuestions, null, 2)}`
    }
  ];

  const data = await postQwenChatCompletion({
    model: QWEN_MODEL,
    messages,
    temperature: 0.25,
    enable_thinking: false,
    max_tokens: 1800
  });

  const raw = readAssistantText(data);
  return normalizeReview(parseJsonObject<ReviewResult>(raw));
}

import "server-only";

import { z } from "zod";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import type { AnalysisResult, ErrorType, Quiz, QuizQuestion, ReviewResult, WrongQuestion } from "@/types/quiz";
import { fixLatex } from "@/lib/latex";

export { fixLatex, normalizeLatexText } from "@/lib/latex";

const QWEN_BASE_URL =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

const QWEN_MODEL = process.env.QWEN_MODEL || process.env.QWEN_TEXT_MODEL || "deepseek-chat";

export type AiTokenUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

let lastAiUsage: AiTokenUsage | null = null;

export function consumeLastAiUsage() {
  const usage = lastAiUsage;
  lastAiUsage = null;
  return usage;
}

export function getQwenModelName() {
  return QWEN_MODEL;
}

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
  constructor(message = "AI 解析结果格式异常，请重试一次。") {
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

function readAssistantText(data: { choices?: Array<{ message?: { content?: string } }> }) {
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("AI 服务没有返回有效内容。");
  }

  return content.trim();
}

function fixLatexArray(input: string[]) {
  return input.map((item) => fixLatex(item));
}

async function parseAiUnknown(raw: string) {
  return robustParseAiJson(raw, z.unknown(), null);
}

function normalizeStringArray(input: unknown, fallback: string[] = []) {
  if (!Array.isArray(input)) {
    return fixLatexArray(fallback);
  }

  const values = input
    .map((item) => fixLatex(String(item).trim()))
    .filter(Boolean);

  return values.length > 0 ? values : fixLatexArray(fallback);
}

function normalizeDifficulty(value: unknown): QuizQuestion["difficulty"] {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  return "medium";
}

function normalizeOptionText(input: string) {
  let text = fixLatex(input.trim());

  text = text.replace(/^[A-D][\s:：.、)-]+/i, "").trim();

  if (/^\$[\s\S]*\$$/.test(text)) {
    return text;
  }

  const looksMath =
    /\\[a-zA-Z]+/.test(text) ||
    /[_^=]/.test(text) ||
    /\b(pi|sqrt|frac|sin|cos|tan|ln|log|sinh|cosh|tanh)\b/i.test(text) ||
    /e\^/.test(text) ||
    /[+\-*/()]/.test(text);

  if (!looksMath) {
    return text;
  }

  let latex = text
    .replace(/\bpi\b/gi, "\\pi")
    .replace(/\bsqrt\s*\(([^)]+)\)/gi, "\\sqrt{$1}")
    .replace(/\bfrac\s*\(([^,]+),\s*([^)]+)\)/gi, "\\frac{$1}{$2}");

  latex = latex.replace(/(?<!\\)\b([0-9]+)\s*\/\s*([0-9]+)\b/g, "\\frac{$1}{$2}");

  return fixLatex(`$${latex}$`);
}

function normalizeOptions(input: unknown): string[] {
  const options = Array.isArray(input)
    ? input.map((item) => normalizeOptionText(String(item)))
    : [];

  while (options.length < 4) {
    options.push(`选项${String.fromCharCode(65 + options.length)}`);
  }

  return options.slice(0, 4);
}

function normalizeAnswerIndex(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) {
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

    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 4) {
      return parsed - 1;
    }
  }

  return 0;
}

function normalizeQuestion(input: unknown): QuizQuestion {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<QuizQuestion> & {
    title?: unknown;
    stem?: unknown;
    prompt?: unknown;
    analysis?: unknown;
    reason?: unknown;
    solution?: unknown;
    knowledge_point?: unknown;
    knowledgePoints?: unknown;
    keyPoint?: unknown;
    tag?: unknown;
    answer?: unknown;
    correctAnswer?: unknown;
    correct_answer?: unknown;
    answer_index?: unknown;
    question_type?: unknown;
  };

  const question =
    typeof value.question === "string" && value.question.trim()
      ? value.question
      : typeof value.title === "string" && value.title.trim()
        ? value.title
        : typeof value.stem === "string" && value.stem.trim()
          ? value.stem
          : typeof value.prompt === "string" && value.prompt.trim()
            ? value.prompt
            : "根据材料生成的同类型练习题";

  const options = normalizeOptions(value.options);

  const answerIndex = normalizeAnswerIndex(
    value.answerIndex ?? value.answer_index ?? value.answer ?? value.correctAnswer ?? value.correct_answer
  );

  const explanation =
    typeof value.explanation === "string" && value.explanation.trim()
      ? value.explanation
      : typeof value.analysis === "string" && value.analysis.trim()
        ? value.analysis
        : typeof value.reason === "string" && value.reason.trim()
          ? value.reason
          : typeof value.solution === "string" && value.solution.trim()
            ? value.solution
            : "本题考查同类型知识点，请根据题干条件进行推理。";

  const knowledgePoint =
    typeof value.knowledgePoint === "string" && value.knowledgePoint.trim()
      ? value.knowledgePoint
      : typeof value.knowledge_point === "string" && value.knowledge_point.trim()
        ? value.knowledge_point
        : typeof value.keyPoint === "string" && value.keyPoint.trim()
          ? value.keyPoint
          : Array.isArray(value.knowledgePoints) && value.knowledgePoints.length > 0
            ? String(value.knowledgePoints[0])
            : typeof value.tag === "string" && value.tag.trim()
              ? value.tag
              : "核心知识点";

  return {
    question: fixLatex(question),
    options,
    answerIndex,
    explanation: fixLatex(explanation),
    knowledgePoint: fixLatex(knowledgePoint),
    difficulty: normalizeDifficulty(value.difficulty),
    tags: normalizeStringArray(value.tags, [knowledgePoint]),
    subject: typeof value.subject === "string" && value.subject.trim() ? fixLatex(value.subject) : undefined,
    questionType:
      typeof value.questionType === "string" && value.questionType.trim()
        ? fixLatex(value.questionType)
        : typeof value.question_type === "string" && value.question_type.trim()
          ? fixLatex(value.question_type)
          : undefined
  };
}

function normalizeQuiz(input: unknown, sourceType: Quiz["sourceType"]): Quiz {
  if (Array.isArray(input)) {
    const questions = input.map(normalizeQuestion).slice(0, 3);

    if (questions.length === 0) {
      throw new AiJsonFormatError();
    }

    return {
      title: "同类型练习",
      summary: "这组题用于训练与原题相同或相近的核心考点。",
      sourceType,
      questions
    };
  }

  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<Quiz> & {
    data?: unknown;
    result?: unknown;
    quiz?: unknown;
    items?: unknown;
    questionList?: unknown;
    question_list?: unknown;
    subject_name?: unknown;
    question_type?: unknown;
  };

  if (value.data) {
    return normalizeQuiz(value.data, sourceType);
  }

  if (value.result) {
    return normalizeQuiz(value.result, sourceType);
  }

  if (value.quiz) {
    return normalizeQuiz(value.quiz, sourceType);
  }

  const rawQuestions = Array.isArray(value.questions)
    ? value.questions
    : Array.isArray(value.items)
      ? value.items
      : Array.isArray(value.questionList)
        ? value.questionList
        : Array.isArray(value.question_list)
          ? value.question_list
          : [];

  if (rawQuestions.length === 0) {
    throw new AiJsonFormatError();
  }

  const questions = rawQuestions.map(normalizeQuestion).slice(0, 3);

  return {
    title: typeof value.title === "string" && value.title.trim() ? fixLatex(value.title) : "同类型练习",
    summary:
      typeof value.summary === "string" && value.summary.trim()
        ? fixLatex(value.summary)
        : "这组题用于训练与原题相同或相近的核心考点。",
    subject:
      typeof value.subject === "string" && value.subject.trim()
        ? fixLatex(value.subject)
        : typeof value.subject_name === "string" && value.subject_name.trim()
          ? fixLatex(value.subject_name)
          : undefined,
    questionType:
      typeof value.questionType === "string" && value.questionType.trim()
        ? fixLatex(value.questionType)
        : typeof value.question_type === "string" && value.question_type.trim()
          ? fixLatex(value.question_type)
          : undefined,
    sourceType,
    questions
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
        ? fixLatex(value.weaknessSummary)
        : "主要薄弱点集中在题型识别、关键条件提取和解题步骤判断。",
    mistakeAnalysis: Array.isArray(value.mistakeAnalysis)
      ? value.mistakeAnalysis.map((item) => {
          const mistake = item as Partial<ReviewResult["mistakeAnalysis"][number]>;

          return {
            question: typeof mistake.question === "string" ? fixLatex(mistake.question) : "错题",
            userMistake: typeof mistake.userMistake === "string" ? fixLatex(mistake.userMistake) : "可能没有准确识别关键条件。",
            correctThinking:
              typeof mistake.correctThinking === "string" ? fixLatex(mistake.correctThinking) : "应先提取题干条件，再套用对应方法。",
            keyPoint: typeof mistake.keyPoint === "string" ? fixLatex(mistake.keyPoint) : "核心知识点"
          };
        })
      : [],
    reviewNotes: Array.isArray(value.reviewNotes) ? value.reviewNotes.map((note) => fixLatex(String(note))) : [],
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
      "options": ["$\\\\frac{16}{18}$", "$\\\\sqrt{2}$", "$x^2$", "$a=16, b=-8$"],
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
5. options 里不要带 A/B/C/D 前缀。
6. 数学表达式必须用 LaTeX，并且包在 $...$ 里。
7. 分数必须写成 "$\\\\frac{16}{18}$"，不能写 16/18。
8. 只输出 JSON。

待修复内容：
${raw}`
      }
    ],
    temperature: 0.1,
    enable_thinking: false,
    max_tokens: 3000
  });

  const repaired = readAssistantText(data);
  return normalizeQuiz(await parseAiUnknown(repaired), sourceType);
}

async function parseQuizWithRepair(raw: string, sourceType: Quiz["sourceType"]) {
  try {
    return normalizeQuiz(await parseAiUnknown(raw), sourceType);
  } catch {
    return repairQuizWithQwen(raw, sourceType);
  }
}

const quizFormatRules = `数学格式要求：
1. 数学内容必须使用 LaTeX 排版，不要使用普通键盘格式。
1.1 行内公式必须使用 $...$，块级公式必须使用 $$...$$。
1.2 不允许输出裸露的 \\frac、\\sqrt、x^2 或 $$ 残片。
2. 分数必须写成 LaTeX 分式，例如不要写 16/18，要写 "$\\\\frac{16}{18}$"。
3. 根号必须写成 "$\\\\sqrt{2}$"。
4. 指数必须写成 "$x^2$" 或 "$e^{-2}$"。
5. 积分必须写成 "$\\\\int_0^1 x^2\\\\,dx$"。
6. options 数组中每个元素必须是独立字符串，不能拼接。
7. options 不要带 A: / B: / C: / D: 前缀。
8. 选项如果是数学表达式，必须包在 $...$ 中。
9. 正确示例：
"options": ["$S_2=\\\\pi(e^2-e^{-2})$", "$S_2=\\\\frac{\\\\pi}{2}(e^2-e^{-2})$", "$S_2=2\\\\pi(e-e^{-1})$", "$S_2=\\\\pi(e-e^{-1})^2$"]`;

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
9. 数学公式必须使用 LaTeX。
10. 每题必须有 4 个选项。
11. answerIndex 必须是 0、1、2、3。
12. difficulty 只能是 easy / medium / hard。
13. 必须生成 3 道题。
14. ${quizFormatRules}

只输出这个 JSON 结构：
{
  "title": "同类型练习标题",
  "summary": "简要说明这组题训练的考点",
  "subject": "学科",
  "questionType": "题型",
  "questions": [
    {
      "question": "新题题干",
      "options": ["$\\\\frac{16}{18}$", "$\\\\frac{8}{9}$", "$\\\\sqrt{2}$", "$x^2+1$"],
      "answerIndex": 0,
      "explanation": "清晰解析",
      "knowledgePoint": "知识点",
      "difficulty": "medium",
      "tags": ["学科", "知识点", "难度"]
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
    max_tokens: 3000
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
5. 公式必须使用 LaTeX。
6. 每题必须有 4 个选项。
7. answerIndex 必须是 0、1、2、3。
8. difficulty 只能是 easy / medium / hard。
9. 必须生成 3 道题。
10. ${quizFormatRules}

只输出这个 JSON 结构：
{
  "title": "同类型练习标题",
  "summary": "简要说明这组题训练的考点",
  "subject": "学科",
  "questionType": "题型",
  "questions": [
    {
      "question": "新题题干",
      "options": ["$\\\\frac{16}{18}$", "$\\\\frac{8}{9}$", "$\\\\sqrt{2}$", "$x^2+1$"],
      "answerIndex": 0,
      "explanation": "清晰解析",
      "knowledgePoint": "知识点",
      "difficulty": "medium",
      "tags": ["学科", "知识点", "难度"]
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
    max_tokens: 3000
  });

  const raw = readAssistantText(data);
  return parseQuizWithRepair(raw, "pdf");
}

function normalizeAnalysis(input: unknown): AnalysisResult {
  if (!input || typeof input !== "object") {
    throw new AiJsonFormatError();
  }

  const value = input as Partial<AnalysisResult> & {
    recognized_text?: unknown;
    solution?: unknown;
    analysis?: unknown;
    knowledge_points?: unknown;
    common_mistakes?: unknown;
    similar_ideas?: unknown;
  };

  const knowledgePoints = normalizeStringArray(
    value.knowledgePoints ?? value.knowledge_points,
    ["核心知识点"]
  );
  const commonMistakes = normalizeStringArray(
    value.commonMistakes ?? value.common_mistakes,
    ["容易忽略题干条件或关键公式"]
  );

  return {
    recognizedText:
      typeof value.recognizedText === "string" && value.recognizedText.trim()
        ? fixLatex(value.recognizedText)
        : typeof value.recognized_text === "string" && value.recognized_text.trim()
          ? fixLatex(value.recognized_text)
          : "未能稳定识别完整题干，请结合原图核对。",
    answer:
      typeof value.answer === "string" && value.answer.trim()
        ? fixLatex(value.answer)
        : "请根据解析步骤判断正确答案。",
    explanation:
      typeof value.explanation === "string" && value.explanation.trim()
        ? fixLatex(value.explanation)
        : typeof value.analysis === "string" && value.analysis.trim()
          ? fixLatex(value.analysis)
          : typeof value.solution === "string" && value.solution.trim()
            ? fixLatex(value.solution)
            : "先提取题干条件，再按对应知识点逐步推导。",
    knowledgePoints,
    commonMistakes,
    similarIdeas: normalizeStringArray(
      value.similarIdeas ?? value.similar_ideas,
      ["先判断题型，再套用同类题的标准步骤。"]
    ),
    subject: typeof value.subject === "string" && value.subject.trim() ? fixLatex(value.subject) : undefined,
    difficulty: normalizeDifficulty(value.difficulty),
    tags: normalizeStringArray(value.tags, knowledgePoints)
  };
}

async function repairAnalysisWithQwen(raw: string): Promise<AnalysisResult> {
  const data = await postQwenChatCompletion({
    model: QWEN_MODEL,
    messages: [
      {
        role: "system",
        content: "你是 JSON 修复器。只能输出合法 JSON，不要解释，不要 Markdown。"
      },
      {
        role: "user",
        content: `请把下面内容修复成严格 JSON，结构必须是：
{
  "recognizedText": "题目摘要，不要完整抄题；数学表达式必须用 $...$ 包裹",
  "answer": "正确答案，数学表达式必须用 $...$ 包裹",
  "explanation": "分步骤解析，控制在 300 字以内；数学表达式必须用 $...$ 包裹",
  "knowledgePoints": ["知识点1"],
  "commonMistakes": ["易错点1"],
  "similarIdeas": ["类似题思路1"],
  "subject": "学科",
  "difficulty": "medium",
  "tags": ["学科", "知识点"]
}

要求：
1. 只输出 JSON。
2. 不要 Markdown。
3. 不要完整抄题，recognizedText 只保留题干摘要。
4. explanation 控制在 300 字以内。
5. 所有数学表达式必须用 $...$ 包裹，例如 $x=\\cosh t+t$、$\\frac{\\pi\\sqrt{2}}{9}$、$\\left(\\frac{dx}{dt}\\right)^2$。
6. 如果原内容被截断，请根据已有内容补成合法 JSON。

待修复内容：
${raw}`
      }
    ],
    temperature: 0.1,
    enable_thinking: false,
    max_tokens: 5000
  });

  return normalizeAnalysis(await parseAiUnknown(readAssistantText(data)));
}

async function parseAnalysis(raw: string) {
  try {
    return normalizeAnalysis(await parseAiUnknown(raw));
  } catch {
    return repairAnalysisWithQwen(raw);
  }
}

const analysisJsonShape = `{
  "recognizedText": "题目摘要，不要完整抄题；数学表达式必须用 $...$ 包裹",
  "answer": "正确答案；数学表达式必须用 $...$ 包裹",
  "explanation": "分步骤解析，控制在 300 字以内；数学表达式必须用 $...$ 包裹",
  "knowledgePoints": ["知识点1", "知识点2"],
  "commonMistakes": ["易错点1", "易错点2"],
  "similarIdeas": ["类似题思路1", "类似题思路2"],
  "subject": "学科",
  "difficulty": "medium",
  "tags": ["学科", "知识点", "难度"]
}`;

export async function analyzeQuestionImageWithQwen({
  base64,
  mimeType
}: {
  base64: string;
  mimeType: string;
}): Promise<AnalysisResult> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文题目解析老师。请识别图片题目并输出结构化 JSON，只输出 JSON，不要 Markdown。"
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请解析图片里的题目。要求：
1. 输出题目识别结果、正确答案、分步骤解析。
2. 标出涉及知识点、易错点、类似题思路。
3. 数学公式必须使用 LaTeX。
4. 不要生成新的 Quiz 题。
5. recognizedText 只保留题干摘要，不要完整抄题。
6. explanation 控制在 300 字以内，避免 JSON 被截断。
7. 所有数学表达式必须使用 LaTeX，并且必须用 $...$ 包裹。
8. 示例：$x=\\cosh t+t$、$\\left(\\frac{dx}{dt}\\right)^2$、$\\frac{\\pi\\sqrt{2}}{9}(16+9\\ln3)$。
9. answer、recognizedText、explanation、commonMistakes、similarIdeas 中只要出现公式、变量、积分、分数、根号、指数，都必须用 $...$ 包裹。
10. 只输出 JSON，结构如下：
${analysisJsonShape}`
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
    temperature: 0.2,
    enable_thinking: false,
    max_tokens: 5000
  });

  return parseAnalysis(readAssistantText(data));
}

export async function analyzeQuestionPdfTextWithQwen(text: string): Promise<AnalysisResult> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中文题目解析老师。请根据用户提供的 PDF 文本输出结构化 JSON，只输出 JSON，不要 Markdown。"
    },
    {
      role: "user",
      content: `请解析下面文本中的题目。要求：
1. 输出题目识别结果、正确答案、分步骤解析。
2. 标出涉及知识点、易错点、类似题思路。
3. 数学公式必须使用 LaTeX。
4. 不要生成新的 Quiz 题。
5. recognizedText 只保留题干摘要，不要完整抄题。
6. explanation 控制在 300 字以内，避免 JSON 被截断。
7. 所有数学表达式必须使用 LaTeX，并且必须用 $...$ 包裹。
8. 示例：$x=\\cosh t+t$、$\\left(\\frac{dx}{dt}\\right)^2$、$\\frac{\\pi\\sqrt{2}}{9}(16+9\\ln3)$。
9. answer、recognizedText、explanation、commonMistakes、similarIdeas 中只要出现公式、变量、积分、分数、根号、指数，都必须用 $...$ 包裹。
10. 只输出 JSON，结构如下：
${analysisJsonShape}

PDF 文本内容：
${text.slice(0, 10000)}`
    }
  ];

  const data = await postQwenChatCompletion({
    model: QWEN_MODEL,
    messages,
    temperature: 0.2,
    enable_thinking: false,
    max_tokens: 5000
  });

  return parseAnalysis(readAssistantText(data));
}

function normalizeErrorType(value: unknown): ErrorType {
  if (value === "概念错误" || value === "审题错误" || value === "计算错误" || value === "知识混淆") {
    return value;
  }

  return "审题错误";
}

function fallbackWrongQuestionInsight(question: WrongQuestion): WrongQuestion {
  const knowledgePoint = question.knowledgePoint || "核心知识点";

  return {
    ...question,
    errorType: question.errorType || "审题错误",
    question: fixLatex(question.question),
    options: question.options ? fixLatexArray(question.options) : question.options,
    explanation: fixLatex(question.explanation),
    errorReason: question.errorReason ? fixLatex(question.errorReason) : "可能没有准确抓住题干条件、选项差异或关键步骤。",
    improvementSuggestion:
      question.improvementSuggestion ? fixLatex(question.improvementSuggestion) : `先复盘「${fixLatex(knowledgePoint)}」的定义和典型题型，再按步骤重做一遍。`,
    tags: normalizeStringArray(question.tags, [
      question.subject || "综合",
      knowledgePoint,
      question.difficulty || "medium",
      question.errorType || "审题错误"
    ])
  };
}

export async function generateWrongQuestionInsights(wrongQuestions: WrongQuestion[]): Promise<WrongQuestion[]> {
  if (wrongQuestions.length === 0) {
    return [];
  }

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_MODEL,
      messages: [
        {
          role: "system",
          content:
            "你是中文学习错因分析助手。只能输出 JSON，不要 Markdown。错误类型只能是：概念错误、审题错误、计算错误、知识混淆。"
        },
        {
          role: "user",
          content: `请为每道错题生成错因分析、改进建议和标签。

输出 JSON：
{
  "items": [
    {
      "question": "题目",
      "errorType": "概念错误|审题错误|计算错误|知识混淆",
      "errorReason": "错因",
      "improvementSuggestion": "改进建议",
      "tags": ["学科", "知识点", "难度", "错误类型"]
    }
  ]
}

错题：
${JSON.stringify(wrongQuestions, null, 2)}`
        }
      ],
      temperature: 0.2,
      enable_thinking: false,
      max_tokens: 2200
    });

    const parsed = (await parseAiUnknown(readAssistantText(data))) as { items?: Array<Partial<WrongQuestion>> } | null;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];

    return wrongQuestions.map((question, index) => {
      const insight = items[index] || {};
      const errorType = normalizeErrorType(insight.errorType);

      return fallbackWrongQuestionInsight({
        ...question,
        errorType,
        errorReason:
          typeof insight.errorReason === "string" && insight.errorReason.trim()
            ? fixLatex(insight.errorReason)
            : question.errorReason,
        improvementSuggestion:
          typeof insight.improvementSuggestion === "string" && insight.improvementSuggestion.trim()
            ? fixLatex(insight.improvementSuggestion)
            : question.improvementSuggestion,
        tags: normalizeStringArray(insight.tags, question.tags || [])
      });
    });
  } catch {
    return wrongQuestions.map(fallbackWrongQuestionInsight);
  }
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
3. 数学内容必须使用 LaTeX。
4. practiceQuestions 中每题必须包含 question、options、answerIndex、explanation、knowledgePoint、difficulty。
5. practiceQuestions 的 options 也必须遵守：
${quizFormatRules}

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
      "options": ["$\\\\frac{16}{18}$", "$\\\\frac{8}{9}$", "$\\\\sqrt{2}$", "$x^2+1$"],
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
    max_tokens: 3000
  });

  const raw = readAssistantText(data);
  return normalizeReview(await parseAiUnknown(raw));
}

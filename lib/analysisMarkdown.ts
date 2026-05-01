import { normalizeLanguage, type AppLanguage } from "@/lib/language";

type SectionKey = "answer" | "explanation" | "knowledge" | "mistakes" | "similar" | "question";

const HEADING_LABELS: Record<SectionKey, string[]> = {
  answer: ["answer", "final answer", "correct answer", "答案", "最终答案", "正确答案"],
  explanation: ["explanation", "solution", "steps", "step-by-step solution", "解析", "分步骤解析", "解题过程"],
  knowledge: ["key points", "knowledge", "knowledge points", "知识点", "涉及知识点"],
  mistakes: ["common mistakes", "common errors", "mistakes", "易错点", "常见错误"],
  similar: ["similar ideas", "similar problem ideas", "transfer ideas", "类似题思路", "类似题目思路", "迁移思路"],
  question: ["question", "problem", "recognized question", "ocr", "image description", "题目", "题目识别", "识别到的题目", "图片描述"]
};

const ZH_HEADINGS: Record<Exclude<SectionKey, "question">, string> = {
  answer: "答案",
  explanation: "解析",
  knowledge: "知识点",
  mistakes: "易错点",
  similar: "类似题思路"
};

const EN_HEADINGS: Record<Exclude<SectionKey, "question">, string> = {
  answer: "Answer",
  explanation: "Explanation",
  knowledge: "Key Points",
  mistakes: "Common Mistakes",
  similar: "Similar Ideas"
};

const THOUGHT_MARKERS = [
  "wait",
  "actually",
  "let me double-check",
  "double-check",
  "this contradicts",
  "contradicts",
  "recompute",
  "re-evaluate",
  "self-check",
  "chain of thought",
  "internal analysis",
  "thinking process",
  "reasoning process",
  "i need to think",
  "let's analyze",
  "let us analyze",
  "我先分析",
  "我先思考",
  "我来分析",
  "让我们分析",
  "重新检查",
  "再核对",
  "矛盾",
  "纠正",
  "自我检查",
  "思考过程",
  "推理过程",
  "内部分析"
];

const FALLBACK_NOISE_MARKERS = [
  "题目识别",
  "识别到的题目",
  "OCR",
  "图片描述",
  "图片内容复杂",
  "图片内容较复杂",
  "根据图片可见信息",
  "根据图片中可见信息",
  "根据可见信息",
  "系统已尝试",
  "浏览器边框",
  "手机截图边框",
  "截图边框",
  "请重新上传",
  "请裁剪",
  "裁剪黑边"
];

function normalizeHeadingLabel(value: string) {
  return value
    .replace(/^[#\s]+/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/^[-*+]\s*/, "")
    .replace(/[:：]\s*$/, "")
    .trim()
    .toLowerCase();
}

export function getAnalysisSectionKeyFromHeading(line: string): SectionKey | null {
  const match = line.match(/^\s*(?:#{1,6}\s*)?(.+?)\s*[:：]?\s*$/);
  if (!match) return null;

  const label = normalizeHeadingLabel(match[1]);

  for (const [key, labels] of Object.entries(HEADING_LABELS) as Array<[SectionKey, string[]]>) {
    if (labels.some((item) => label === item.toLowerCase())) {
      return key;
    }
  }

  return null;
}

function isAllowedMistakeHeading(line: string) {
  const key = getAnalysisSectionKeyFromHeading(line);
  return key === "mistakes";
}

export function shouldDropAnalysisLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^<\/?think\b/i.test(trimmed)) return true;
  if (isAllowedMistakeHeading(trimmed)) return false;

  const lower = trimmed.toLowerCase();

  if (THOUGHT_MARKERS.some((marker) => lower.includes(marker.toLowerCase()))) {
    return true;
  }

  if (/\b(my|a|the)\s+mistake\b/i.test(trimmed) || /\bcorrection\b/i.test(trimmed)) {
    return true;
  }

  return FALLBACK_NOISE_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

function normalizeHeadingLine(line: string, language?: AppLanguage) {
  const key = getAnalysisSectionKeyFromHeading(line);
  if (!key || key === "question") return line;
  if (!language) return line;

  const level = line.match(/^\s*(#{1,6})/)?.[1] || "##";
  const normalized = normalizeLanguage(language);
  const label = normalized === "en" ? EN_HEADINGS[key] : ZH_HEADINGS[key];

  return `${level} ${label}`;
}

export function cleanAnalysisMarkdownLine(line: string, language?: AppLanguage): string | null {
  if (shouldDropAnalysisLine(line)) return null;

  const key = getAnalysisSectionKeyFromHeading(line);
  if (key === "question") return null;

  return normalizeHeadingLine(line, language);
}

export function stripThinkBlocks(input: string) {
  return String(input || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "");
}

export function cleanAnalysisMarkdown(input: string, language?: AppLanguage) {
  const lines = stripThinkBlocks(input).replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let skippingQuestionSection = false;

  for (const line of lines) {
    const key = getAnalysisSectionKeyFromHeading(line);

    if (key === "question") {
      skippingQuestionSection = true;
      continue;
    }

    if (skippingQuestionSection && key) {
      skippingQuestionSection = false;
    }

    if (skippingQuestionSection) {
      continue;
    }

    const cleaned = cleanAnalysisMarkdownLine(line, language);
    if (cleaned === null) continue;

    output.push(cleaned);
  }

  return output
    .join("\n")
    .replace(/^\s*\${1,2}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

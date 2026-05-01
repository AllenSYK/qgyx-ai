const labelMap: Record<string, string> = {
  algebra: "代数",
  geometry: "几何",
  calculus: "微积分",
  function: "函数",
  functions: "函数",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  math: "数学",
  mathematics: "数学",
  "linear equations": "一次方程",
  equation: "方程",
  equations: "方程",
  probability: "概率",
  statistics: "统计",
  derivative: "导数",
  derivatives: "导数",
  integral: "积分",
  trigonometry: "三角函数",
  "calculation error": "计算错误",
  "concept error": "概念错误",
  "conceptual error": "概念错误",
  "reading misunderstanding": "审题错误",
  "knowledge confusion": "知识混淆",
  easy: "简单",
  medium: "中等",
  hard: "困难",
  quiz: "Quiz",
  analysis: "题目解析",
  quiz_analysis: "Quiz + 解析"
};

function hasChinese(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

export function translateTagLabel(value?: string | null) {
  const text = value?.trim();

  if (!text) {
    return "未分类";
  }

  if (hasChinese(text)) {
    return text;
  }

  const normalized = text.toLowerCase().replace(/[_-]+/g, " ").trim();
  const translated = labelMap[normalized];

  return translated ? `${text} / ${translated}` : text;
}

export function formatModeLabel(value?: string | null) {
  if (value === "analysis") return "题目解析";
  if (value === "quiz_analysis") return "Quiz + 解析";
  return "Quiz";
}

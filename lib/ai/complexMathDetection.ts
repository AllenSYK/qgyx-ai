import "server-only";

const COMPLEX_PATTERNS: RegExp[] = [
  /\b(prove|proof|show\s+that|证明|求证)\b/i,
  /\b(differentiate|derivative|integration|calculus|微分|积分|求导|导数)\b/i,
  /\b(tangent|normal|gradient|切线|法线|斜率|梯度)\b/i,
  /\b(function|curve|graph|函数|曲线|图像|图像)\b/i,
  /\b(coordinate\s+geometry|坐标系|坐标几何)\b/i,
  /\b(trigonometry|sin|cos|tan|三角函数|正弦|余弦|正切)\b/i,
  /\b(vector|向量|矢量)\b/i,
  /\b(sequence|series|数列|级数|等差|等比)\b/i,
  /\b(probability|概率|条件概率|贝叶斯)\b/i,
  /\\int\b/,
  /\\frac\{d[xy]\}\{d[xy]\}/,
  /\\lim\b/,
  /\\sum\b/,
  /dy\s*\/\s*dx/,
  /\b(12u\^?\s*2|二次方程.*u\s*=)\b/i,
];

export function detectComplexMathQuestion(questionText: string): boolean {
  const text = String(questionText || "").trim();
  if (!text) return false;

  let matchCount = 0;

  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(text)) {
      matchCount += 1;
      if (matchCount >= 2) return true;
    }
  }

  if (text.length > 300 && /\\(frac|sqrt|int|sum|lim)/.test(text)) {
    return true;
  }

  return false;
}

export type ComplexityLevel = "simple" | "moderate" | "complex";

export function getQuestionComplexity(questionText: string): ComplexityLevel {
  const text = String(questionText || "").trim();
  if (!text) return "simple";

  let score = 0;

  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(text)) score += 1;
  }

  if (text.length > 500) score += 1;
  if (/\\(int|sum|lim|frac\{d)/.test(text)) score += 1;
  if ((text.match(/\\frac/g) || []).length >= 2) score += 1;

  if (score >= 3) return "complex";
  if (score >= 1) return "moderate";
  return "simple";
}

export function getComplexityWarning(level: ComplexityLevel, tier: string): string | null {
  if (level === "complex" && tier === "free") {
    return "本题为复杂数学题，免费版使用轻量模型解析，结果可能存在偏差。升级会员可获得更精确的完整推导。";
  }
  return null;
}

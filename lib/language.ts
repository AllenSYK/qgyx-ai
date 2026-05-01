export type AppLanguage = "zh" | "en";

export function normalizeLanguage(value: unknown): AppLanguage {
  return value === "en" ? "en" : "zh";
}

export function languageName(language: AppLanguage) {
  return language === "en" ? "English" : "中文";
}

export function languageInstruction(language: AppLanguage) {
  return language === "en"
    ? "All user-facing strings in the JSON values must be written in English."
    : "JSON 字段值中的所有面向用户内容必须使用中文。";
}

export const mathOutputInstruction = `数学表达要求：
1. 所有公式必须使用 LaTeX。
2. 行内公式必须统一用 $...$ 包裹，例如 $x^2$、$\\frac{\\pi}{3}$、$\\sqrt{x}$。
3. 块级公式必须统一用 $$...$$ 包裹。
4. 不要输出裸露的 \\frac、\\sqrt、x^2 或不成对的 $$。
5. 不要写 x^2 这种未包裹的裸文本。
6. 不要写“x平方”“π除以3”“根号x”这类口语表达，必须写成 $x^2$、$\\frac{\\pi}{3}$、$\\sqrt{x}$。`;

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
1. 所有公式、变量、方程、不等式、函数、坐标、集合、区间、分数、根式、指数、角度、比例和单位计算都必须使用 LaTeX。
2. 行内公式必须统一用单个 $ 包裹，例如 $x^{2}$、$\\frac{\\pi}{3}$、$\\sqrt{x}$。
3. 块级公式必须统一用 $$ ... $$ 包裹。
4. 禁止使用 \\( ... \\) 或 \\[ ... \\] 包裹公式。
5. 禁止输出残缺 LaTeX：\\frac{2}{ 必须写成 \\frac{2}{x}，不允许未闭合的大括号。
6. 禁止 dx dy 顺序错乱，必须与题目要求一致。
7. 禁止把公式拆成多行乱码。
8. 输出要像考试试卷：凡是可以用数学形式表达的内容，优先写成标准数学符号，不要写成一堆口语化文字。
9. 题目、解析、答案、Quiz question、Quiz options、错题解析中的数学内容都必须遵守本规则。
10. Quiz 选项如果整体是数学对象，选项字符串应尽量只保留数学式，例如 “$\\frac{1}{2}$”、”$x^{2}+1$”。
11. 不要输出裸露的 \\frac、\\sqrt、x^2 或不成对的括号。
12. 不要写 x^2 这种未包裹的裸文本。
13. 不要写”x平方””x的平方””π除以3””根号x””点A坐标(1,2)”这类口语表达，必须写成 $x^{2}$、$\\frac{\\pi}{3}$、$\\sqrt{x}$。
14. 不要把普通中文或英文句子放进 $ ... $，例如 where、given、substitute、then、because 必须作为普通文字。
15. 数学推导必须完整，不能停在中间式。例如得到 12x^4 + 5x^2 - 2 = 0 后必须继续解，令 u = x^2，因式分解，求出最终 x 和 y 值。
16. JSON 字符串中的反斜杠必须写成 \\\\，例如 \\\\frac、\\\\sqrt、\\\\pi。`;

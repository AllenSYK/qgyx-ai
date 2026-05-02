export type NormalizeMathResult = {
  text: string;
  needsRepair: boolean;
  warnings: string[];
};

function hasBalancedBraces(input: string): boolean {
  let count = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const prev = i > 0 ? input[i - 1] : "";

    if (ch === "{" && prev !== "\\") count++;
    if (ch === "}" && prev !== "\\") count--;

    if (count < 0) return false;
  }

  return count === 0;
}

function countMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

function hasBalancedMathDelimiters(input: string): boolean {
  const inlineOpen = countMatches(input, /\\\(/g);
  const inlineClose = countMatches(input, /\\\)/g);
  const blockOpen = countMatches(input, /\\\[/g);
  const blockClose = countMatches(input, /\\\]/g);

  return inlineOpen === inlineClose && blockOpen === blockClose;
}

function normalizeLatexCommands(input: string): string {
  let text = input;

  text = text
    .replace(/\$\$/g, "")
    .replace(/\$+/g, "")
    .replace(/\\le\s*q/g, "\\leq")
    .replace(/\\ge\s*q/g, "\\geq")
    .replace(/\\le\s*\n\s*q/g, "\\leq")
    .replace(/\\ge\s*\n\s*q/g, "\\geq")
    .replace(/\\leq+/g, "\\leq")
    .replace(/\\geq+/g, "\\geq")
    .replace(/\u2264/g, "\\leq")
    .replace(/\u2265/g, "\\geq")
    .replace(/\u2260/g, "\\neq")
    .replace(/\u2248/g, "\\approx")
    .replace(/π/g, "\\pi")
.replace(/\u221a/g, "\\sqrt")
.replace(/\u00d7/g, "\\times")
.replace(/\u00f7/g, "\\div");

  text = text
    .replace(/\\frac\s*\{\s*\\pi\s*\}\s*\{\s*3\s*\}/g, "\\frac{\\pi}{3}")
    .replace(/\\frac\s*\{\s*2\s*\\pi\s*\}\s*\{\s*3\s*\}/g, "\\frac{2\\pi}{3}")
    .replace(/\\frac\s*\{\s*2\s*\}\s*\{\s*x\s*2\s*\}/g, "\\frac{2}{x^2}")
    .replace(/\\frac\s*\{\s*2\s*\}\s*\{\s*x\^2\s*\}/g, "\\frac{2}{x^2}")
    .replace(/\\frac\s*\{\s*dy\s*\}\s*\{\s*dx\s*\}/g, "\\frac{dy}{dx}");

  text = text
    .replace(/d\s*y\s*\/\s*d\s*x/g, "\\frac{dy}{dx}")
    .replace(/dy\s*\/\s*dx/g, "\\frac{dy}{dx}")
    .replace(/dx\s*dy/g, "\\frac{dy}{dx}")
    .replace(/d\s*y\s*d\s*x/g, "\\frac{dy}{dx}");

  text = text
    .replace(/x\s*\n\s*2/g, "x^2")
    .replace(/x\s+2/g, "x^2")
    .replace(/x\s*\n\s*3/g, "x^3")
    .replace(/x\s+3/g, "x^3")
    .replace(/x\s*\n\s*4/g, "x^4")
    .replace(/x\s+4/g, "x^4");

  text = text
    .replace(/([A-Za-z0-9)\]}])²/g, "$1^2")
    .replace(/([A-Za-z0-9)\]}])³/g, "$1^3")
    .replace(/([A-Za-z0-9)\]}])⁴/g, "$1^4")
    .replace(/([A-Za-z0-9)\]}])⁵/g, "$1^5")
    .replace(/([A-Za-z0-9)\]}])⁶/g, "$1^6")
    .replace(/([A-Za-z0-9)\]}])⁷/g, "$1^7")
    .replace(/([A-Za-z0-9)\]}])⁸/g, "$1^8")
    .replace(/([A-Za-z0-9)\]}])⁹/g, "$1^9")
    .replace(/([A-Za-z0-9)\]}])⁰/g, "$1^0");

  text = text
    .replace(/\\arg\s*\(\s*z\s*\)/g, "\\arg(z)")
    .replace(/\\sin\s*\(\s*([^)]+?)\s*\)/g, "\\sin($1)")
    .replace(/\\cos\s*\(\s*([^)]+?)\s*\)/g, "\\cos($1)")
    .replace(/\\tan\s*\(\s*([^)]+?)\s*\)/g, "\\tan($1)");

  text = text.replace(/\\frac\{\s*([^{}]+?)\s*\}\{\s*([^{}]+?)\s*\}/g, (_match, a: string, b: string) => {
    return `\\frac{${a.trim()}}{${b.trim()}}`;
  });

  return text;
}

function wrapKnownMathExpressions(input: string): string {
  let text = input;

  text = text.replace(
    /\\frac\{\\pi\}\{3\}\s*\\leq\s*\\arg\(z\)\s*\\leq\s*\\frac\{2\\pi\}\{3\}/g,
    "\\( \\frac{\\pi}{3} \\leq \\arg(z) \\leq \\frac{2\\pi}{3} \\)"
  );

  text = text.replace(
    /\|z\|\s*=\s*4/g,
    "\\( |z|=4 \\)"
  );

  text = text.replace(
    /\\frac\{dy\}\{dx\}\s*=\s*12x\^2\s*-\s*\\frac\{2\}\{x\^2\}/g,
    "\\( \\frac{dy}{dx}=12x^2-\\frac{2}{x^2} \\)"
  );

  text = text.replace(
    /12x\^4\s*\+\s*5x\^2\s*-\s*2\s*=\s*0/g,
    "\\( 12x^4+5x^2-2=0 \\)"
  );

  text = text.replace(
    /\(3u\s*\+\s*2\)\(4u\s*-\s*1\)\s*=\s*0/g,
    "\\( (3u+2)(4u-1)=0 \\)"
  );

  return text;
}

function normalizeSpacing(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasBrokenFrac(input: string): boolean {
  return /\\frac\{[^}]*$/.test(input) || /\\frac\{[^}]*\}\{[^}]*$/.test(input);
}

function hasBrokenCommand(input: string): boolean {
  return /\\(le|ge)\s+q/.test(input) || /\\frac\s*$/.test(input);
}

export function normalizeMathText(raw: unknown): NormalizeMathResult {
  const warnings: string[] = [];

  if (raw === null || raw === undefined) {
    return {
      text: "",
      needsRepair: false,
      warnings,
    };
  }

  let text = String(raw);

  text = normalizeSpacing(text);
  text = normalizeLatexCommands(text);
  text = wrapKnownMathExpressions(text);
  text = normalizeSpacing(text);

  const bracesOk = hasBalancedBraces(text);
  const delimitersOk = hasBalancedMathDelimiters(text);
  const brokenFrac = hasBrokenFrac(text);
  const brokenCommand = hasBrokenCommand(text);

  if (!bracesOk) warnings.push("LaTeX braces are not balanced.");
  if (!delimitersOk) warnings.push("LaTeX math delimiters are not balanced.");
  if (brokenFrac) warnings.push("Broken \\frac expression detected.");
  if (brokenCommand) warnings.push("Broken LaTeX command detected.");

  return {
    text,
    needsRepair: !bracesOk || !delimitersOk || brokenFrac || brokenCommand,
    warnings,
  };
}

export function toPlainMathFallback(raw: unknown): string {
  const normalized = normalizeMathText(raw).text;

  return normalized
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\leq/g, "")
    .replace(/\\geq/g, "")
    .replace(/\\neq/g, "")
    .replace(/\\approx/g, "")
    .replace(/\\pi/g, "π")
    .replace(/\\arg/g, "arg")
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\sqrt/g, "sqrt")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeRenderMathText(raw: unknown): string {
  const result = normalizeMathText(raw);

  if (!result.needsRepair) {
    return result.text;
  }

  return toPlainMathFallback(result.text);
}

export function normalizeLatex(raw: unknown): string {
  return safeRenderMathText(raw);
}

export function normalizeLatexText(raw: unknown): string {
  return safeRenderMathText(raw);
}

export function sanitizeLatex(raw: unknown): string {
  return safeRenderMathText(raw);
}

export function cleanAiLatex(raw: unknown): string {
  return safeRenderMathText(raw);
}

export function fixLatex(raw: unknown): string {
  return safeRenderMathText(raw);
}

export function repairLatex(raw: unknown): string {
  return safeRenderMathText(raw);
}

export function normalizeMathObject<T>(value: T): T {
  if (typeof value === "string") {
    return safeRenderMathText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMathObject(item)) as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = normalizeMathObject(item);
    }

    return output as T;
  }

  return value;
}

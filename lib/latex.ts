export function wrapBareLatexSegment(value: string) {
  return value.replace(
    /(\\(?:frac|sqrt|sum|int|lim|sin|cos|tan|ln|log|pi|theta|alpha|beta|gamma|Delta|left|right)(?:\{[^{}]*\}|\([^)]*\)|\[[^\]]*\]|[A-Za-z0-9_^+\-*/=.,\s])*)/g,
    (_match, formula: string) => {
      const trimmed = formula.trim();
      return trimmed ? `$${trimmed}$` : formula;
    }
  );
}

export function wrapBareLatex(value: string) {
  const mathBlockPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  let cursor = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = mathBlockPattern.exec(value)) !== null) {
    result += wrapBareLatexSegment(value.slice(cursor, match.index));
    result += match[0];
    cursor = match.index + match[0].length;
  }

  result += wrapBareLatexSegment(value.slice(cursor));
  return result;
}

function normalizePlainMathText(value: string) {
  return value
    .replace(/\bsqrt\s*\(([^()\n]+)\)/gi, (_match, body: string) => `$\\sqrt{${body.trim()}}$`)
    .replace(
      /(?<![$\\\w])([A-Za-z])\^(\{?[0-9A-Za-z+\-]+\}?)/g,
      (_match, base: string, exponent: string) => `$${base}^${exponent}$`
    )
    .replace(
      /(?<![$\\\d])(\d{1,4})\s*\/\s*(\d{1,4})(?![$\\\d])/g,
      (_match, numerator: string, denominator: string) => {
        if (denominator === "0") {
          return `${numerator}/${denominator}`;
        }

        return `$\\frac{${numerator}}{${denominator}}$`;
      }
    );
}

function normalizeOutsideMath(value: string) {
  const mathBlockPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  let cursor = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = mathBlockPattern.exec(value)) !== null) {
    result += normalizePlainMathText(value.slice(cursor, match.index));
    result += match[0];
    cursor = match.index + match[0].length;
  }

  result += normalizePlainMathText(value.slice(cursor));
  return result;
}

export function normalizeLatexText(input: string) {
  const normalized = String(input || "")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\${3,}/g, "$$")
    .replace(/\$([0-9]+)\$\s*(\\[a-zA-Z]+)/g, (_match, coefficient: string, command: string) => `$${coefficient}${command}$`)
    .replace(/\$+\s*\$+/g, "$$")
    .replace(/\$([^$\n]+)\$\s*(\\[a-zA-Z]+)/g, "$$$1$2$")
    .replace(/\$\$\s*\$([^$]+)\$\s*\$\$/g, (_match, formula: string) => `$$${formula.trim()}$$`)
    .replace(/\$\$\s*\$\$/g, "")
    .replace(/\\frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}]+)\}\s*([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([A-Za-z0-9])\s*\{([^{}]+)\}/g, "\\frac{$1}{$2}")
    .trim();

  return wrapBareLatex(normalizeOutsideMath(normalized));
}

export const fixLatex = normalizeLatexText;

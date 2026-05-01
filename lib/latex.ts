const LATEX_COMMANDS =
  "frac|sqrt|left|right|cdot|times|Rightarrow|Leftarrow|rightarrow|leftarrow|le|ge|neq|approx|sin|cos|tan|arcsin|arccos|arctan|ln|log|pi|theta|alpha|beta|gamma|Delta|delta|lambda|mu|rho|sigma|omega|vec|mathbf|overline|boxed|angle|triangle|int|sum|lim|text";

function repairBrokenSyntax(input: string) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\$/g, "$")
    .replace(/\${3,}/g, "$$")
    .replace(/\\frac\s*\$+\s*\{([^{}\n]+)\}\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\s*\$+\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\sqrt\s*\$+\s*\{([^{}\n]+)\}/g, "\\sqrt{$1}")
    .replace(/\\boxed\s*\$+\s*\{([^{}\n]+)\}/g, "\\boxed{$1}")
    .replace(/\\text\s*\$+\s*\{([^{}\n]+)\}/g, "\\text{$1}")
    .replace(/(\})\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx|frac|sqrt|left|right)\b)/g, "$1 $2")
    .replace(/\$+(?=\})/g, "")
    .replace(/\$+\s*([,，。；;:：)）])/g, "$1")
    .replace(/([（(])\s*\$+/g, "$1")
    .replace(/\$+\s*\$+/g, "$$")
    .trim();
}

function hasCjk(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function isProse(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (hasCjk(text)) return true;

  const words = text.match(/[A-Za-z]{3,}/g) || [];
  const commands = text.match(/\\[A-Za-z]+/g) || [];

  return words.length >= 3 && commands.length === 0;
}

function wrapMath(value: string) {
  const clean = repairBrokenSyntax(value).trim();
  if (!clean || isProse(clean)) return clean;
  if (clean.startsWith("$") && clean.endsWith("$")) return clean;
  return `$${clean}$`;
}

function normalizeMathBlocks(value: string) {
  return repairBrokenSyntax(value)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => {
      const fixed = repairBrokenSyntax(formula).trim();
      if (!fixed) return "";
      if (isProse(fixed)) return fixed;
      return `$$${fixed}$$`;
    })
    .replace(/\$([^$\n]+)\$/g, (_match, formula: string) => {
      const fixed = repairBrokenSyntax(formula).trim();
      if (!fixed) return "";
      if (isProse(fixed)) return fixed;
      return `$${fixed}$`;
    })
    .replace(/\$\$([,，。；;:：])/g, "$1")
    .replace(/([A-Za-z0-9}\)])\$\$(?=[,，。；;:：])/g, "$1")
    .replace(/([A-Za-z0-9}\)])\$\$(?=\s*$)/gm, "$1")
    .replace(/\$\$\s*$/gm, "")
    .replace(/\$\s+\$/g, "");
}

function wrapBareLatex(text: string) {
  let next = text;

  next = next.replace(
    /(\\frac\{[^{}\n]+\}\{[^{}\n]+\}|\\sqrt\{[^{}\n]+\}|\\boxed\{[^{}\n]+\}|\\left\s*[\(\[\{.][^，。；;\n]*?\\right\s*[\)\]\}.]|\\angle\s*[A-Za-z0-9]+)/g,
    (match) => wrapMath(match)
  );

  next = next.replace(
    /(^|[\s（(，。；、])([A-Za-z]\^[{]?[0-9A-Za-z+\-]+[}]?)/g,
    (_match, prefix: string, formula: string) => `${prefix}${wrapMath(formula)}`
  );

  return next;
}

export function normalizeLatexText(input: string) {
  return wrapBareLatex(normalizeMathBlocks(String(input || ""))).trim();
}

export const fixLatex = normalizeLatexText;
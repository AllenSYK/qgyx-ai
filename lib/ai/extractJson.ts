export function extractJsonFromText(raw: string) {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const object = extractBalancedJson(cleaned, "{", "}");
  if (object) {
    return object;
  }

  const array = extractBalancedJson(cleaned, "[", "]");
  if (array) {
    return array;
  }

  return cleaned;
}

function extractBalancedJson(input: string, openChar: "{" | "[", closeChar: "}" | "]") {
  for (let start = 0; start < input.length; start += 1) {
    if (input[start] !== openChar) {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < input.length; index += 1) {
      const char = input[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === openChar) {
        depth += 1;
      } else if (char === closeChar) {
        depth -= 1;

        if (depth === 0) {
          return input.slice(start, index + 1).trim();
        }
      }
    }
  }

  return "";
}

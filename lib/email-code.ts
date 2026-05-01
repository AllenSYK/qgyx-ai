import { createHmac, randomInt, timingSafeEqual } from "crypto";

export const EMAIL_CODE_LENGTH = 8;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeEmailCode(code: string) {
  return code.trim().replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
}

export function generateEmailCode() {
  let code = "";

  for (let index = 0; index < EMAIL_CODE_LENGTH; index += 1) {
    code += String(randomInt(0, 10));
  }

  return code;
}

export function hashEmailCode(email: string, code: string) {
  const secret = process.env.EMAIL_CODE_SECRET;

  if (!secret) {
    throw new Error("EMAIL_CODE_SECRET 未配置。");
  }

  return createHmac("sha256", secret)
    .update(`${normalizeEmail(email)}:${normalizeEmailCode(code)}`)
    .digest("hex");
}

export function verifyEmailCodeHash(email: string, code: string, expectedHash: string) {
  const actual = Buffer.from(hashEmailCode(email, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

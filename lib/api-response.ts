import { NextResponse } from "next/server";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json<ApiEnvelope<T>>(
    {
      success: true,
      data,
      error: null
    },
    { status }
  );
}

export const ok = apiSuccess;

export function apiError(error: string, status = 400) {
  return NextResponse.json<ApiEnvelope<null>>(
    {
      success: false,
      data: null,
      error
    },
    { status }
  );
}

export function fail(message: string, statusCode = 400, details?: unknown) {
  if (details !== undefined) {
    console.error("api_error", {
      message,
      details
    });
  }

  return apiError(message, statusCode);
}

export function readApiError(input: unknown, fallback: string) {
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const value = input as { error?: unknown; message?: unknown };
  return typeof value.error === "string"
    ? value.error
    : typeof value.message === "string"
      ? value.message
      : fallback;
}

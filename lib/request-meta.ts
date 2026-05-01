export type RequestMeta = {
  ipAddress: string | null;
  ipCountry: string | null;
  ipRegion: string | null;
  ipCity: string | null;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function getRequestMeta(request: Request): RequestMeta {
  const headers = request.headers;
  const ipAddress =
    firstHeaderValue(headers.get("x-forwarded-for")) ||
    firstHeaderValue(headers.get("x-real-ip")) ||
    firstHeaderValue(headers.get("cf-connecting-ip"));

  return {
    ipAddress,
    ipCountry: headers.get("cf-ipcountry") || null,
    ipRegion: headers.get("x-vercel-ip-country-region") || null,
    ipCity: headers.get("x-vercel-ip-city") || null
  };
}

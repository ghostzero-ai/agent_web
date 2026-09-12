export class MobileServerUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileServerUrlError";
  }
}

export function normalizeMobileServerUrl(
  value: string | undefined,
): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new MobileServerUrlError(
      "CAPACITOR_SERVER_URL must be an absolute HTTPS URL.",
    );
  }
  if (url.protocol !== "https:") {
    throw new MobileServerUrlError(
      "CAPACITOR_SERVER_URL must use HTTPS. Keep local access behind Tailscale.",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new MobileServerUrlError(
      "CAPACITOR_SERVER_URL cannot contain credentials, query parameters, or a fragment.",
    );
  }
  return url.toString();
}

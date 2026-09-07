const DNS_RETRY_DELAYS_MS = [100, 300] as const;

function getNetworkErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException("The operation was aborted.", "AbortError"),
    );
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(
        signal?.reason ??
          new DOMException("The operation was aborted.", "AbortError"),
      );
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchWithTransientDnsRetry(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetcher(url, init);
    } catch (error) {
      const delay = DNS_RETRY_DELAYS_MS[attempt];
      if (
        signal?.aborted ||
        getNetworkErrorCode(error) !== "EAI_AGAIN" ||
        delay === undefined
      ) {
        throw error;
      }
      console.warn("[model-provider] Retrying after transient DNS failure", {
        code: "EAI_AGAIN",
        attempt: attempt + 2,
      });
      await pause(delay, signal);
    }
  }
}

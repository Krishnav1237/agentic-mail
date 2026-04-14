export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15000
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

export const safeJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${text}`);
  }
};

export class ProviderHttpError extends Error {
  readonly status: number;
  readonly context: string;
  readonly body: string;

  constructor(input: { status: number; context: string; body: string }) {
    super(`${input.context} failed with status ${input.status}`);
    this.name = 'ProviderHttpError';
    this.status = input.status;
    this.context = input.context;
    this.body = input.body;
  }
}

export const assertOk = async (response: Response, context: string) => {
  if (response.ok) return response;
  const body = await response.text();
  throw new ProviderHttpError({
    status: response.status,
    context,
    body,
  });
};

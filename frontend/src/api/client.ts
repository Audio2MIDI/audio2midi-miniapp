/**
 * Typed API client — single wrapper over fetch().
 *
 * - baseURL = '/api'
 * - Automatic Authorization header (tma token)
 * - Unified error handling with typed errors
 * - Generic response typing
 */

const BASE_URL = '/api';

/** Thrown on non-2xx responses or network failures. */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Return the current Telegram initData string (if available). */
function getInitData(): string | null {
  const tg = (window as unknown as Record<string, unknown>).Telegram as
    | { WebApp?: { initData?: string } }
    | undefined;
  return tg?.WebApp?.initData ?? null;
}

/** Build headers with optional Authorization. */
function buildHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const initData = getInitData();
  if (initData && !headers.has('Authorization')) {
    headers.set('Authorization', `tma ${initData}`);
  }
  return headers;
}

/** Parse response — throw ApiError on non-2xx. */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    const message =
      (body && typeof body === 'object' && 'error' in body
        ? String((body as Record<string, unknown>).error)
        : null) ?? `HTTP ${response.status}`;
    throw new ApiError(message, response.status, body);
  }
  return response.json() as Promise<T>;
}

/** GET request with optional query params. */
export async function get<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(),
  });
  return handleResponse<T>(response);
}

/** POST request with JSON or FormData body. */
export async function post<T>(
  path: string,
  body?: Record<string, unknown> | FormData,
): Promise<T> {
  const headers = buildHeaders();
  let fetchBody: BodyInit | undefined;

  if (body instanceof FormData) {
    // Let browser set Content-Type with boundary
    fetchBody = body;
  } else if (body) {
    headers.set('Content-Type', 'application/json');
    fetchBody = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: fetchBody,
  });
  return handleResponse<T>(response);
}

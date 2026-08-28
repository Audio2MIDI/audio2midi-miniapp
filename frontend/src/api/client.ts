/**
 * Typed API client — single wrapper over fetch().
 *
 * - baseURL = '/api'
 * - Automatic Authorization header (tma token)
 * - Unified error handling with typed errors
 * - Generic response typing
 */

const BASE_URL = '/api';
const NETWORK_ERROR_MESSAGE = 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.';

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

/** Convert browser-specific network errors such as "Failed to fetch" into product copy. */
export async function fetchWithNetworkError(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
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
    const payload = body && typeof body === 'object'
      ? body as Record<string, unknown>
      : null;
    const message = payload?.detail
      ? String(payload.detail)
      : payload?.error
        ? String(payload.error)
        : `HTTP ${response.status}`;
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
  const response = await fetchWithNetworkError(url.toString(), {
    method: 'GET',
    headers: buildHeaders(),
    credentials: 'include',
  });
  return handleResponse<T>(response);
}

/** POST request with JSON or FormData body. */
export async function post<T>(
  path: string,
  body?: Record<string, unknown> | FormData,
  options?: { headers?: HeadersInit },
): Promise<T> {
  const headers = buildHeaders(options?.headers);
  let fetchBody: BodyInit | undefined;

  if (body instanceof FormData) {
    // Let browser set Content-Type with boundary
    fetchBody = body;
  } else if (body) {
    headers.set('Content-Type', 'application/json');
    fetchBody = JSON.stringify(body);
  }

  const response = await fetchWithNetworkError(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: fetchBody,
    credentials: 'include',
  });
  if (response.status === 204) {
    return undefined as T;
  }
  return handleResponse<T>(response);
}

/** PUT request with a JSON body. */
export async function put<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const headers = buildHeaders({ 'Content-Type': 'application/json' });
  const response = await fetchWithNetworkError(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (response.status === 204) return undefined as T;
  return handleResponse<T>(response);
}

/** PATCH request with a JSON body. */
export async function patch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const headers = buildHeaders({ 'Content-Type': 'application/json' });
  const response = await fetchWithNetworkError(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(response);
}

/** DELETE request. */
export async function del(path: string): Promise<void> {
  const response = await fetchWithNetworkError(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
    credentials: 'include',
  });
  if (response.status === 204) return;
  await handleResponse<unknown>(response);
}

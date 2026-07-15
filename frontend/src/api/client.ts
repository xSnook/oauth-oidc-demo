interface ApiErrorBody {
  detail?: {
    code?: string;
    message?: string;
  };
}

let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let code = response.statusText || 'ERROR';
    let message = response.statusText || `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      code = body.detail?.code ?? code;
      message = body.detail?.message ?? message;
    } catch {
      // Keep the status-based fallback.
    }

    if (response.status === 401 && path !== '/api/auth/me') {
      onUnauthorized?.();
    }

    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, body?: unknown) =>
    api<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    api<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

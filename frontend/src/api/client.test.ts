import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiClient, setUnauthorizedHandler } from './client';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('returns json and sends same-origin credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(api<{ ok: boolean }>('/api/example')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/example', {
      credentials: 'same-origin',
      headers: {},
    });
  });

  it('returns undefined for empty responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api<void>('/api/logout')).resolves.toBeUndefined();
  });

  it('adds json headers for requests with bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));

    await apiClient.patch('/api/users/1/role', { role: 'admin' });

    expect(fetchMock).toHaveBeenCalledWith('/api/users/1/role', {
      credentials: 'same-origin',
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
      headers: { 'content-type': 'application/json' },
    });
  });

  it('omits a post body when no body is supplied', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await apiClient.post('/api/auth/logout');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      credentials: 'same-origin',
      method: 'POST',
      body: undefined,
      headers: {},
    });
  });

  it('serializes post bodies when supplied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiClient.post('/api/auth/google', { id_token: 'token' });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google', {
      credentials: 'same-origin',
      method: 'POST',
      body: JSON.stringify({ id_token: 'token' }),
      headers: { 'content-type': 'application/json' },
    });
  });

  it('throws structured API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { detail: { code: 'NOPE', message: 'Nope.' } },
        { status: 403, statusText: 'Forbidden' },
      ),
    );

    await expect(api('/api/admin')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'NOPE',
      message: 'Nope.',
    });
  });

  it('keeps fallback error fields when the json error body is partial', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: {} }, { status: 418, statusText: 'Teapot' }),
    );

    await expect(api('/api/teapot')).rejects.toMatchObject({
      status: 418,
      code: 'Teapot',
      message: 'Teapot',
    });
  });

  it('falls back to status text when an error body is not json', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500, statusText: 'Oops' }));

    await expect(api('/api/broken')).rejects.toEqual(new ApiError(500, 'Oops', 'Oops'));
  });

  it('falls back to the status number when status text is empty', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 400, statusText: '' }));

    await expect(api('/api/bad')).rejects.toMatchObject({
      status: 400,
      code: 'ERROR',
      message: 'Request failed with 400',
    });
  });

  it('calls the unauthorized handler for non-session 401s only', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }));

    await expect(api('/api/dashboard')).rejects.toBeInstanceOf(ApiError);
    await expect(api('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

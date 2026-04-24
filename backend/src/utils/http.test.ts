import { describe, expect, it } from 'vitest';
import { assertOk, ProviderHttpError, safeJson } from './http.js';

describe('http utils', () => {
  it('parses JSON payloads', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const parsed = await safeJson<{ ok: boolean }>(response);
    expect(parsed.ok).toBe(true);
  });

  it('throws ProviderHttpError for non-2xx responses', async () => {
    const response = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
    });
    await expect(assertOk(response, 'Provider call')).rejects.toBeInstanceOf(
      ProviderHttpError
    );
  });
});

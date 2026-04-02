import { describe, it, expect } from 'vitest';

// Isolated re-implementation of redis URL parser from config/redis.ts
const parseRedisUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: Number(parsed.port) || 6379,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
      maxRetriesPerRequest: null as null,
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null as null,
    };
  }
};

// Isolated re-implementation of DB SSL config from config/db.ts
const getSslConfig = (
  databaseUrl: string,
  nodeEnv: string,
  sslOverride?: string
) => {
  if (sslOverride === 'false') return false;
  if (sslOverride === 'verify') return { rejectUnauthorized: true };

  const needsSsl =
    databaseUrl.includes('supabase') ||
    databaseUrl.includes('neon.tech') ||
    databaseUrl.includes('ssl=true');

  if (!needsSsl) return false;
  if (nodeEnv === 'production') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
};

const parseCookieSameSite = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid AUTH_COOKIE_SAME_SITE value: ${value}. Expected lax, strict, or none.`
  );
};

const parseBoolean = (value?: string) => {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(
    `Invalid boolean value: ${value}. Expected true, false, or empty.`
  );
};

const resolveCookieConfig = (
  nodeEnv: string,
  sameSiteInput?: string,
  secureInput?: string
) => {
  const sameSite = parseCookieSameSite(
    sameSiteInput ?? (nodeEnv === 'production' ? 'none' : 'lax')
  );
  const secure =
    parseBoolean(secureInput) ??
    (nodeEnv === 'production' || sameSite === 'none');

  if (sameSite === 'none' && !secure) {
    throw new Error(
      'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.'
    );
  }

  return { sameSite, secure };
};

describe('Redis URL Parser', () => {
  it('parses a simple localhost URL', () => {
    const result = parseRedisUrl('redis://localhost:6379');
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6379);
    expect(result.password).toBeUndefined();
    expect(result.db).toBe(0);
  });

  it('parses a URL with password', () => {
    const result = parseRedisUrl('redis://:mysecret@redis.example.com:6380/2');
    expect(result.host).toBe('redis.example.com');
    expect(result.port).toBe(6380);
    expect(result.password).toBe('mysecret');
    expect(result.db).toBe(2);
  });

  it('parses URL with encoded password', () => {
    const result = parseRedisUrl('redis://:p%40ssw%23rd@host.io:6379');
    expect(result.password).toBe('p@ssw#rd');
  });

  it('defaults to localhost:6379 on parse failure', () => {
    const result = parseRedisUrl('not-a-url');
    expect(result.host).toBe('127.0.0.1');
    expect(result.port).toBe(6379);
  });

  it('defaults port to 6379 when not specified', () => {
    const result = parseRedisUrl('redis://myhost');
    expect(result.host).toBe('myhost');
    expect(result.port).toBe(6379);
  });

  it('always includes maxRetriesPerRequest: null for BullMQ', () => {
    const result = parseRedisUrl('redis://localhost:6379');
    expect(result.maxRetriesPerRequest).toBeNull();
  });
});

describe('DB SSL Config', () => {
  it('enables SSL for Supabase URLs in development (unverified)', () => {
    const result = getSslConfig(
      'postgres://x@supabase.com:5432/db',
      'development'
    );
    expect(result).toEqual({ rejectUnauthorized: false });
  });

  it('enables verified SSL for Supabase URLs in production', () => {
    const result = getSslConfig(
      'postgres://x@supabase.com:5432/db',
      'production'
    );
    expect(result).toEqual({ rejectUnauthorized: true });
  });

  it('enables SSL for neon.tech URLs', () => {
    const result = getSslConfig(
      'postgres://x@ep-cool.neon.tech:5432/db',
      'development'
    );
    expect(result).toEqual({ rejectUnauthorized: false });
  });

  it('enables SSL when ssl=true in URL', () => {
    const result = getSslConfig(
      'postgres://localhost:5432/db?ssl=true',
      'development'
    );
    expect(result).toEqual({ rejectUnauthorized: false });
  });

  it('disables SSL for plain localhost URLs', () => {
    const result = getSslConfig('postgres://localhost:5432/db', 'development');
    expect(result).toBe(false);
  });

  it('respects DATABASE_SSL=false override', () => {
    const result = getSslConfig(
      'postgres://x@supabase.com:5432/db',
      'production',
      'false'
    );
    expect(result).toBe(false);
  });

  it('respects DATABASE_SSL=verify override', () => {
    const result = getSslConfig(
      'postgres://localhost:5432/db',
      'development',
      'verify'
    );
    expect(result).toEqual({ rejectUnauthorized: true });
  });
});

describe('Cookie Config', () => {
  it('defaults to lax + insecure in development', () => {
    expect(resolveCookieConfig('development')).toEqual({
      sameSite: 'lax',
      secure: false,
    });
  });

  it('defaults to none + secure in production', () => {
    expect(resolveCookieConfig('production')).toEqual({
      sameSite: 'none',
      secure: true,
    });
  });

  it('allows explicit strict cookies', () => {
    expect(resolveCookieConfig('production', 'strict')).toEqual({
      sameSite: 'strict',
      secure: true,
    });
  });

  it('rejects sameSite none without secure cookies', () => {
    expect(() =>
      resolveCookieConfig('production', 'none', 'false')
    ).toThrowError(
      'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.'
    );
  });
});

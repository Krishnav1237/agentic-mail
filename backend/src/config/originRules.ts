export type ExactOriginRule = {
  type: 'exact';
  origin: string;
};

export type PatternOriginRule = {
  type: 'pattern';
  protocol: string;
  hostnamePattern: RegExp;
  port: string | null;
};

export type OriginRule = ExactOriginRule | PatternOriginRule;

const patternOriginRegex =
  /^(https?):\/\/(?<hostname>[^/:]+)(?::(?<port>\*|\d+))?$/i;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toHostnamePattern = (hostname: string) => {
  const source = hostname.toLowerCase().split('*').map(escapeRegex).join('.*');
  return new RegExp(`^${source}$`);
};

export const parseOriginRule = (value: string): OriginRule | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const patternMatch = trimmed.match(patternOriginRegex);
  const hostname = patternMatch?.groups?.hostname;
  const port = patternMatch?.groups?.port ?? null;
  if (patternMatch && hostname && (hostname.includes('*') || port === '*')) {
    return {
      type: 'pattern',
      protocol: patternMatch[1]!.toLowerCase(),
      hostnamePattern: toHostnamePattern(hostname),
      port,
    };
  }

  try {
    const parsed = new URL(trimmed);
    return { type: 'exact', origin: parsed.origin };
  } catch {
    return null;
  }
};

export const getPrimaryOrigin = (rules: OriginRule[], fallbackOrigin: string) =>
  rules.find((rule): rule is ExactOriginRule => rule.type === 'exact')
    ?.origin ?? fallbackOrigin;

export const isOriginAllowedByRules = (
  rules: OriginRule[],
  origin?: string | null
) => {
  if (!origin) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  return rules.some((rule) => {
    if (rule.type === 'exact') {
      return parsedOrigin.origin === rule.origin;
    }

    if (parsedOrigin.protocol !== `${rule.protocol}:`) {
      return false;
    }

    if (rule.port && rule.port !== '*' && parsedOrigin.port !== rule.port) {
      return false;
    }

    return rule.hostnamePattern.test(parsedOrigin.hostname.toLowerCase());
  });
};

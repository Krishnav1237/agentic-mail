import { env } from './env.js';
import {
  getPrimaryOrigin,
  isOriginAllowedByRules,
  parseOriginRule,
  type OriginRule,
} from './originRules.js';

const configuredOriginRules = env.frontendUrl
  .split(',')
  .map(parseOriginRule)
  .filter((rule): rule is OriginRule => rule !== null);

const fallbackOrigin = 'http://localhost:5173';

export const getPrimaryFrontendOrigin = () =>
  getPrimaryOrigin(configuredOriginRules, fallbackOrigin);

export const isAllowedOrigin = (origin?: string | null) =>
  isOriginAllowedByRules(configuredOriginRules, origin);

import { getMemory, upsertMemory } from '../memory/store.js';

export type SenderPolicyMode = 'always' | 'never' | 'suggest_only';

export type SenderPolicyRule = {
  senderKey: string;
  mode: SenderPolicyMode;
  actionTypes?: string[];
  updatedAt: string;
};

const MEMORY_SCOPE = 'long' as const;
const MEMORY_KEY = 'sender_policy_rules';

const normalizeSenderKey = (value: string) => value.trim().toLowerCase();

const normalizeActionTypes = (items?: string[]) => {
  if (!items?.length) return undefined;
  const unique = new Set(
    items.map((item) => item.trim().toLowerCase()).filter(Boolean)
  );
  return unique.size ? Array.from(unique) : undefined;
};

export const getSenderPolicyRules = async (userId: string) => {
  const stored =
    (await getMemory<SenderPolicyRule[]>(userId, MEMORY_SCOPE, MEMORY_KEY)) ?? [];
  return stored
    .map((rule) => ({
      senderKey: normalizeSenderKey(rule.senderKey),
      mode: rule.mode,
      actionTypes: normalizeActionTypes(rule.actionTypes),
      updatedAt: rule.updatedAt ?? new Date().toISOString(),
    }))
    .filter((rule) => rule.senderKey.length > 0);
};

export const updateSenderPolicyRules = async (
  userId: string,
  rules: Array<{
    senderKey: string;
    mode: SenderPolicyMode;
    actionTypes?: string[];
  }>
) => {
  const now = new Date().toISOString();
  const normalized = rules
    .map((rule) => ({
      senderKey: normalizeSenderKey(rule.senderKey),
      mode: rule.mode,
      actionTypes: normalizeActionTypes(rule.actionTypes),
      updatedAt: now,
    }))
    .filter((rule) => rule.senderKey.length > 0);

  await upsertMemory(userId, MEMORY_SCOPE, MEMORY_KEY, normalized);
  return normalized;
};

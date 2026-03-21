import { env } from '../config/env.js';
import { fetchWithTimeout, safeJson } from '../utils/http.js';

export type LLMResult = {
  content: string;
  raw: unknown;
};

const requireKey = (name: string, key: string) => {
  if (!key) {
    throw new Error(`Missing ${name} API key`);
  }
};

export const callLLM = async (prompt: string): Promise<LLMResult> => {
  const provider = env.aiProvider;

  if (provider === 'openrouter') {
    requireKey('OPENROUTER_API_KEY', env.openrouterApiKey);
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.openrouterApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env.aiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a precise JSON-only extractor.' },
          { role: 'user', content: prompt }
        ]
      })
    }, env.aiTimeoutMs);

    const data = await safeJson<any>(response);
    const content = data?.choices?.[0]?.message?.content ?? '';
    return { content, raw: data };
  }

  if (provider === 'groq') {
    requireKey('GROQ_API_KEY', env.groqApiKey);
    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env.aiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a precise JSON-only extractor.' },
          { role: 'user', content: prompt }
        ]
      })
    }, env.aiTimeoutMs);

    const data = await safeJson<any>(response);
    const content = data?.choices?.[0]?.message?.content ?? '';
    return { content, raw: data };
  }

  if (provider === 'gemini') {
    requireKey('GEMINI_API_KEY', env.geminiApiKey);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.aiModel}:generateContent?key=${env.geminiApiKey}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    }, env.aiTimeoutMs);

    const data = await safeJson<any>(response);
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { content, raw: data };
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
};

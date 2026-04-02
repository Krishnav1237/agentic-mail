import type { RequestHandler } from 'express';
import { z } from 'zod';

type Source = 'body' | 'query';

export const validate = <T extends z.ZodTypeAny>(
  schema: T,
  source: Source = 'body'
): RequestHandler => {
  return (req, res, next) => {
    const payload = source === 'body' ? req.body : req.query;
    const result = schema.safeParse(payload);
    if (!result.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request', details: result.error.flatten() });
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      req.query = result.data as any;
    }
    return next();
  };
};

import { Router, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const syncRouter = Router();

// ─── GET /sync/status ─────────────────────────────────────────────────────────
syncRouter.get('/status', authenticateJwt, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.userId;

  try {
    const stateRes = await query(
      `SELECT provider, history_id, last_synced_at, sync_status, error_message
       FROM provider_sync_states
       WHERE user_id = $1 AND provider = 'google'`,
      [userId]
    );

    const state = stateRes.rows[0];

    const activeRunRes = await query(
      `SELECT id, sync_type, status, messages_processed, is_truncated, started_at
       FROM sync_runs
       WHERE user_id = $1 AND status IN ('pending', 'running')
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );

    const activeRun = activeRunRes.rows[0] || null;

    res.json({
      provider: 'google',
      syncStatus: state?.sync_status ?? 'idle',
      historyId: state?.history_id ?? null,
      lastSyncedAt: state?.last_synced_at ?? null,
      errorMessage: state?.error_message ?? null,
      activeRun,
    });
  } catch {
    next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to retrieve sync status', 500));
  }
});

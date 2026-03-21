import { query } from '../db/index.js';

export type EnergyContext = {
  energyLevel: 'low' | 'medium' | 'high';
  bestTime: string;
  bestHour: number | null;
};

const formatBestTime = (hour: number) => {
  const start = hour.toString().padStart(2, '0');
  const end = ((hour + 2) % 24).toString().padStart(2, '0');
  return `${start}:00-${end}:00`;
};

const fallbackBestHour = (currentHour: number) => {
  if (currentHour >= 6 && currentHour <= 10) return 9;
  if (currentHour >= 11 && currentHour <= 15) return 13;
  if (currentHour >= 16 && currentHour <= 20) return 18;
  return 21;
};

const computeEnergyLevel = (currentHour: number, bestHour: number) => {
  const diff = Math.min(Math.abs(currentHour - bestHour), 24 - Math.abs(currentHour - bestHour));
  if (diff <= 2) return 'high';
  if (diff <= 5) return 'medium';
  return 'low';
};

export const getEnergyContext = async (userId: string): Promise<EnergyContext> => {
  const result = await query<{ hour: number; count: number }>(
    `SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*)::int as count
     FROM user_behavior_logs
     WHERE user_id = $1
       AND created_at >= now() - interval '14 days'
     GROUP BY hour
     ORDER BY count DESC
     LIMIT 1`,
    [userId]
  );

  const currentHour = new Date().getHours();
  const bestHour = result.rows[0]?.hour ?? fallbackBestHour(currentHour);
  const energyLevel = computeEnergyLevel(currentHour, bestHour);

  return {
    energyLevel,
    bestTime: formatBestTime(bestHour),
    bestHour: result.rows[0]?.hour ?? null
  };
};

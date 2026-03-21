import { query } from '../db/index.js';

export type TaskRow = {
  id: string;
  email_id: string;
  message_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  link: string | null;
  category: string | null;
  priority_score: number;
  status: string;
  created_at: string;
};

export type DashboardSections = {
  criticalToday: TaskRow[];
  upcomingDeadlines: TaskRow[];
  opportunities: TaskRow[];
  lowPriority: TaskRow[];
};

export type TaskQuery = {
  limit: number;
  offset: number;
  status?: string;
  category?: string;
  query?: string;
  sort?: 'priority' | 'due' | 'created';
  minPriority?: number;
  maxPriority?: number;
  dueOnly?: boolean;
  dueFrom?: string;
  dueTo?: string;
};

export type TaskListResult = {
  tasks: TaskRow[];
  total: number;
  limit: number;
  offset: number;
};

const buildTaskFilters = (userId: string, input: TaskQuery) => {
  const conditions: string[] = ['t.user_id = $1'];
  const params: Array<string | number | boolean | string[]> = [userId];

  const addParam = (value: string | number | boolean | string[]) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (input.status) {
    conditions.push(`t.status = ${addParam(input.status)}`);
  }

  if (input.category) {
    const categories = input.category.split(',').map((item) => item.trim()).filter(Boolean);
    if (categories.length > 1) {
      conditions.push(`t.category = ANY(${addParam(categories)})`);
    } else if (categories.length === 1) {
      conditions.push(`t.category = ${addParam(categories[0])}`);
    }
  }

  if (input.query) {
    const value = `%${input.query}%`;
    conditions.push(`(
      concat_ws(' ', coalesce(t.title, ''), coalesce(t.description, '')) ILIKE ${addParam(value)}
    )`);
  }

  if (input.minPriority !== undefined) {
    conditions.push(`t.priority_score >= ${addParam(input.minPriority)}`);
  }

  if (input.maxPriority !== undefined) {
    conditions.push(`t.priority_score <= ${addParam(input.maxPriority)}`);
  }

  if (input.dueOnly) {
    conditions.push('t.due_at IS NOT NULL');
  }

  if (input.dueFrom) {
    conditions.push(`t.due_at >= ${addParam(input.dueFrom)}`);
  }

  if (input.dueTo) {
    conditions.push(`t.due_at <= ${addParam(input.dueTo)}`);
  }

  return { conditions, params };
};

const buildTaskOrder = (sort?: TaskQuery['sort']) => {
  if (sort === 'due') {
    return 't.due_at ASC NULLS LAST, t.priority_score DESC';
  }
  if (sort === 'created') {
    return 't.created_at DESC';
  }
  return 't.priority_score DESC, t.due_at ASC NULLS LAST';
};

export const listTasksPaginated = async (userId: string, input: TaskQuery): Promise<TaskListResult> => {
  const { conditions, params } = buildTaskFilters(userId, input);
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total
     FROM extracted_tasks t
     ${whereClause}`,
    params
  );

  const orderClause = buildTaskOrder(input.sort);
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  const listResult = await query<TaskRow>(
    `SELECT t.id, t.email_id, e.message_id, t.title, t.description, t.due_at, t.link, t.category,
            t.priority_score::float as priority_score, t.status, t.created_at
     FROM extracted_tasks t
     JOIN emails e ON e.id = t.email_id
     ${whereClause}
     ORDER BY ${orderClause}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...params, input.limit, input.offset]
  );

  return {
    tasks: listResult.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit: input.limit,
    offset: input.offset
  };
};

export const dashboardSections = async (userId: string): Promise<DashboardSections> => {
  const critical = await query<TaskRow>(
    `SELECT t.id, t.email_id, e.message_id, t.title, t.description, t.due_at, t.link, t.category, t.priority_score::float as priority_score, t.status, t.created_at
     FROM extracted_tasks t
     JOIN emails e ON e.id = t.email_id
     WHERE t.user_id = $1
       AND (t.due_at::date = current_date OR t.priority_score >= 3)
       AND t.status = 'open'
     ORDER BY t.due_at ASC NULLS LAST, t.priority_score DESC
     LIMIT 20`,
    [userId]
  );

  const upcoming = await query<TaskRow>(
    `SELECT t.id, t.email_id, e.message_id, t.title, t.description, t.due_at, t.link, t.category, t.priority_score::float as priority_score, t.status, t.created_at
     FROM extracted_tasks t
     JOIN emails e ON e.id = t.email_id
     WHERE t.user_id = $1
       AND t.due_at::date > current_date
       AND t.due_at::date <= current_date + interval '7 days'
       AND t.status = 'open'
     ORDER BY t.due_at ASC
     LIMIT 50`,
    [userId]
  );

  const opportunities = await query<TaskRow>(
    `SELECT t.id, t.email_id, e.message_id, t.title, t.description, t.due_at, t.link, t.category, t.priority_score::float as priority_score, t.status, t.created_at
     FROM extracted_tasks t
     JOIN emails e ON e.id = t.email_id
     WHERE t.user_id = $1
       AND t.category IN ('internship', 'event')
       AND t.status = 'open'
     ORDER BY t.priority_score DESC, t.due_at ASC NULLS LAST
     LIMIT 50`,
    [userId]
  );

  const lowPriority = await query<TaskRow>(
    `SELECT t.id, t.email_id, e.message_id, t.title, t.description, t.due_at, t.link, t.category, t.priority_score::float as priority_score, t.status, t.created_at
     FROM extracted_tasks t
     JOIN emails e ON e.id = t.email_id
     WHERE t.user_id = $1
       AND t.priority_score < 1
       AND t.status = 'open'
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [userId]
  );

  return {
    criticalToday: critical.rows,
    upcomingDeadlines: upcoming.rows,
    opportunities: opportunities.rows,
    lowPriority: lowPriority.rows
  };
};

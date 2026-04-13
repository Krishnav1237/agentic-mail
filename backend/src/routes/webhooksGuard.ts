export type GraphNotification = {
  subscriptionId: string;
  clientState?: string;
};

export type GraphSubscriptionRow = {
  user_id: string;
  client_state: string;
};

export const shouldEnqueueGraphNotification = (
  notification: GraphNotification,
  row: GraphSubscriptionRow | undefined
) => {
  if (!row) return false;
  if (!notification.clientState) return false;
  if (!row.client_state) return false;
  return notification.clientState === row.client_state;
};

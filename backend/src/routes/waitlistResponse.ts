export type WaitlistJoinStatus = 'created' | 'duplicate';

export type WaitlistJoinResponse = {
  success: true;
  status: WaitlistJoinStatus;
  message: string;
};

export const buildWaitlistJoinResponse = (
  wasCreated: boolean
): WaitlistJoinResponse =>
  wasCreated
    ? {
        success: true,
        status: 'created',
        message: 'Your email has been added to the waitlist.',
      }
    : {
        success: true,
        status: 'duplicate',
        message: "You are already on the waitlist. We'll onboard you soon.",
      };

export const getWaitlistJoinStatusCode = (status: WaitlistJoinStatus) =>
  status === 'created' ? 201 : 200;

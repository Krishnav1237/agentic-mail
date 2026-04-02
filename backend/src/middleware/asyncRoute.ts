import type { NextFunction, Request, Response, RequestHandler } from 'express';

type AsyncRequestHandler<TRequest extends Request = Request> = (
  req: TRequest,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncRoute = <TRequest extends Request = Request>(
  handler: AsyncRequestHandler<TRequest>
): RequestHandler => {
  return (req, res, next) => {
    void handler(req as TRequest, res, next).catch(next);
  };
};

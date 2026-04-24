import { Router } from 'express';
import { renderAdminPage } from './adminPage.js';

export const adminRouter = Router();

adminRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.type('html').send(renderAdminPage());
});

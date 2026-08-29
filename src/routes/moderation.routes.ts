import { Router, Request, Response } from 'express';

const router = Router();

// POST /moderation/report
router.post('/report', (_req: Request, res: Response) => {
  res.status(201).json({
    success: true,
    message: 'Report submitted',
  });
});

// GET /moderation/actions
router.get('/actions', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
  });
});

export default router;

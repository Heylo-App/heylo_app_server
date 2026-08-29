import { Router, Request, Response } from 'express';

const router = Router();

// GET /voice/rooms
router.get('/rooms', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
  });
});

// POST /voice/rooms/:id/join
router.post('/rooms/:id/join', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Joined room',
    data: { roomId: req.params['id'] },
  });
});

// POST /voice/rooms/:id/leave
router.post('/rooms/:id/leave', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Left room',
    data: { roomId: req.params['id'] },
  });
});

// GET /voice/rooms/:id/token
router.get('/rooms/:id/token', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      roomId: req.params['id'],
      token: 'mock-voice-token',
    },
  });
});

export default router;

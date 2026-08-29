import { Router, Request, Response } from 'express';

const router = Router();

// GET /chats
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
  });
});

// GET /chats/:id/messages
router.get('/:id/messages', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
    meta: { chatId: req.params['id'] },
  });
});

// POST /chats/:id/messages
router.post('/:id/messages', (req: Request, res: Response) => {
  res.status(201).json({
    success: true,
    message: 'Message sent',
    data: { chatId: req.params['id'], messageId: 'new-msg-id' },
  });
});

export default router;

import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { Chat } from '../models/Chat';
import { ChatMessage } from '../models/ChatMessage';

const router = Router();

// GET /chats
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chats = await Chat.find({ participants: req.user?.id })
      .populate('participants', 'alias username avatarId')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, data: chats });
  } catch (error) {
    console.error('Fetch chats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /chats/:id/messages
router.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chat = await Chat.findOne({ _id: req.params['id'], participants: req.user?.id });
    if (!chat) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    const messages = await ChatMessage.find({ chatId: chat._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

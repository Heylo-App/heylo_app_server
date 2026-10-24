import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { Chat } from '../models/Chat';
import { ChatMessage } from '../models/ChatMessage';

const router = Router();

// POST /chats (Create or get existing 1-on-1 chat with recipient)
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { recipientId } = req.body;
    const currentUserId = req.user?.id;

    if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
      res.status(400).json({ success: false, message: 'Valid recipient ID is required' });
      return;
    }

    if (recipientId === currentUserId) {
      res.status(400).json({ success: false, message: 'Cannot start chat with yourself' });
      return;
    }

    const currentObjId = new mongoose.Types.ObjectId(currentUserId);
    const recipientObjId = new mongoose.Types.ObjectId(recipientId);

    let chat = await Chat.findOne({
      participants: { $all: [currentObjId, recipientObjId], $size: 2 },
    }).populate('participants', 'alias username avatarId');

    if (!chat) {
      chat = new Chat({ participants: [currentObjId, recipientObjId] });
      await chat.save();
      await chat.populate('participants', 'alias username avatarId');
    }

    res.json({ success: true, data: chat });
  } catch (error) {
    console.error('Create or get chat error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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

// GET /chats/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const chat = await Chat.findOne({ _id: req.params['id'], participants: req.user?.id })
      .populate('participants', 'alias username avatarId')
      .lean();

    if (!chat) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    res.json({ success: true, data: chat });
  } catch (error) {
    console.error('Fetch chat error:', error);
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

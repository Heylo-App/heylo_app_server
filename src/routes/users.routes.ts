import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User';
import { ActiveUser } from '../models/ActiveUser';
import { broadcastEvent } from '../socket';

const router = Router();

// PUT /users/me (Update profile)
router.put('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { alias, username, language, mood, avatarId } = req.body;
    const user = await User.findById(req.user?.id);
    
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (alias !== undefined) user.alias = alias;
    if (username !== undefined) user.username = username;
    if (language !== undefined) user.language = language;
    if (mood !== undefined) user.mood = mood;
    if (avatarId !== undefined) user.avatarId = avatarId;

    await user.save();

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        alias: user.alias,
        avatarId: user.avatarId,
        mood: user.mood,
        needs: user.needs,
        language: user.language,
        age: user.age,
        reputation: user.reputation,
        createdAt: user.createdAt,
        isOnboarded: user.isOnboarded,
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /users/active
router.get('/active', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    const query: any = {};
    if (currentUserId && mongoose.Types.ObjectId.isValid(currentUserId)) {
      query.userId = { $ne: new mongoose.Types.ObjectId(currentUserId) };
    }

    const activeUsers = await ActiveUser.find(query)
      .populate('userId', 'alias username avatarId')
      .sort({ updatedAt: -1 })
      .lean();
    
    // Filter out entries where the User document was not found or is null
    const validUsers = activeUsers.filter((u: any) => u.userId != null);

    // Also check current user's active status
    let myStatus: any = { isActive: false };
    if (currentUserId && mongoose.Types.ObjectId.isValid(currentUserId)) {
      const myRecord = await ActiveUser.findOne({ userId: new mongoose.Types.ObjectId(currentUserId) }).lean();
      if (myRecord) {
        myStatus = {
          isActive: true,
          moodId: myRecord.moodId,
          vibe: myRecord.vibe,
          updatedAt: myRecord.updatedAt,
        };
      }
    }
    
    res.json({ success: true, data: validUsers, myStatus });
  } catch (error) {
    console.error('Fetch active users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /users/active/toggle
router.post('/active/toggle', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(401).json({ success: false, message: 'Invalid or missing user' });
      return;
    }

    const { moodId, vibe, isActive } = req.body;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    if (isActive) {
      if (!moodId || !vibe) {
        res.status(400).json({ success: false, message: 'Mood and vibe are required to become active' });
        return;
      }

      const activeRecord = await ActiveUser.findOneAndUpdate(
        { userId: userObjectId },
        {
          userId: userObjectId,
          moodId,
          vibe,
          socketId: 'http_active',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Broadcast real-time change to all sockets
      broadcastEvent('active_users_updated');

      res.json({
        success: true,
        isActive: true,
        data: activeRecord,
      });
    } else {
      await ActiveUser.findOneAndDelete({ userId: userObjectId });

      // Broadcast real-time change to all sockets
      broadcastEvent('active_users_updated');

      res.json({
        success: true,
        isActive: false,
      });
    }
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /users/search
router.get('/search', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = req.query.q as string;
    if (!q) {
      res.json({ success: true, data: [] });
      return;
    }

    // Search by username, case-insensitive, limiting to top 3
    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user?.id }
    })
      .select('username alias avatarId mood')
      .limit(3)
      .lean();

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /users/suggested
router.get('/suggested', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
  });
});

// GET /users/:id
router.get('/:id', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.params['id'],
      name: 'Test User',
      avatar: null,
      mood: null,
    },
  });
});

export default router;

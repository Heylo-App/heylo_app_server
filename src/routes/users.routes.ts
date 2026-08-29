import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User';

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

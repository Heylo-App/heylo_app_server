import { Router, Response } from 'express';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// POST /onboarding/complete
router.post('/complete', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, alias, avatarId, mood, needs, language, age } = req.body;

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (username) {
      const trimmedUsername = username.trim().toLowerCase();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmedUsername)) {
        res.status(400).json({
          success: false,
          message: 'Username must be 3-20 characters and contain only letters, numbers, and underscores',
        });
        return;
      }
      // Check if username is already taken
      const existing = await User.findOne({ username: trimmedUsername, _id: { $ne: user._id } });
      if (existing) {
        res.status(400).json({ success: false, message: 'Username is already taken' });
        return;
      }
      user.username = trimmedUsername;
    }

    if (alias) user.alias = alias.trim();
    if (avatarId) user.avatarId = avatarId;
    if (mood) user.mood = mood;
    if (needs) user.needs = needs;
    if (language) user.language = language;
    if (age) user.age = age;
    
    user.isOnboarded = true;
    await user.save();

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
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
      },
      message: 'Onboarding completed',
    });
  } catch (error: any) {
    console.error('Onboarding error:', error);
    if (error?.code === 11000) {
      res.status(400).json({ success: false, message: 'Username is already taken' });
      return;
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

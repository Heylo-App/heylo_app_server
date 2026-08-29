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
      // Check if username is already taken
      const existing = await User.findOne({ username, _id: { $ne: user._id } });
      if (existing) {
        res.status(400).json({ success: false, message: 'Username is already taken' });
        return;
      }
      user.username = username;
    }

    if (alias) user.alias = alias;
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
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

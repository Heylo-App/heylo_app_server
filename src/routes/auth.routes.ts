import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { config } from '../config/env';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  const refreshToken = jwt.sign({ id: userId }, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });
  
  // Example for expiresAt for client
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins for standard access token

  return { accessToken, refreshToken, expiresAt };
};

// POST /auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ success: false, message: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    const tokens = generateTokens(user.id);

    res.status(201).json({
      success: true,
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isOnboarded: user.isOnboarded,
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({ success: false, message: 'Identifier and password required' });
      return;
    }

    // Identifier can be email or username
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });

    if (!user || !user.password) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const tokens = generateTokens(user.id);

    res.json({
      success: true,
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        alias: user.alias,
        avatarId: user.avatarId,
        mood: user.mood,
        needs: user.needs,
        reputation: user.reputation,
        createdAt: user.createdAt,
        isOnboarded: user.isOnboarded,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token required' });
      return;
    }

    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as { id: string };
    const tokens = generateTokens(decoded.id);

    res.json({
      success: true,
      ...tokens,
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, (_req: AuthRequest, res: Response) => {
  // In a real app with stateful tokens, invalidate it here.
  // For stateless JWT, client deletes it.
  res.json({ success: true, message: 'Logged out' });
});

// GET /auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id).select('-password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

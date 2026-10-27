import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { ActivityModel } from '../models/Activity';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// GET /activity - Fetch recent activity for authenticated user
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const recipientObjectId = new mongoose.Types.ObjectId(userId);

    const [activities, unreadCount] = await Promise.all([
      ActivityModel.find({ recipientId: recipientObjectId })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('actorId', 'alias username avatarId mood')
        .lean(),
      ActivityModel.countDocuments({ recipientId: recipientObjectId, isRead: false }),
    ]);

    const formatted = activities.map((item: any) => ({
      id: item._id.toString(),
      recipientId: item.recipientId.toString(),
      type: item.type,
      momentId: item.momentId.toString(),
      commentId: item.commentId ? item.commentId.toString() : null,
      snippet: item.snippet || '',
      isRead: Boolean(item.isRead),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      actor: {
        id: item.actorId?._id?.toString() || '',
        alias: item.actorId?.alias || 'Someone',
        username: item.actorId?.username || '',
        avatarId: item.actorId?.avatarId || 'avatar-1',
      },
    }));

    res.json({
      success: true,
      data: formatted,
      unreadCount,
    });
  } catch (error) {
    console.error('[Activity] Error fetching activities:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /activity/read - Mark activities as read
router.post('/read', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const recipientObjectId = new mongoose.Types.ObjectId(userId);
    const { activityIds } = req.body;

    if (Array.isArray(activityIds) && activityIds.length > 0) {
      const validIds = activityIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      await ActivityModel.updateMany(
        { _id: { $in: validIds }, recipientId: recipientObjectId },
        { isRead: true }
      );
    } else {
      // Mark all read for this recipient
      await ActivityModel.updateMany(
        { recipientId: recipientObjectId, isRead: false },
        { isRead: true }
      );
    }

    const unreadCount = await ActivityModel.countDocuments({
      recipientId: recipientObjectId,
      isRead: false,
    });

    res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error('[Activity] Error marking activity read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /activity/unread-count - Quick polling / sync for unread count
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const count = await ActivityModel.countDocuments({
      recipientId: new mongoose.Types.ObjectId(userId),
      isRead: false,
    });

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error('[Activity] Error getting unread count:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { MomentModel } from '../models/Moment';
import { CommentModel } from '../models/Comment';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { broadcastEvent } from '../socket';

const router = Router();

// Helper function to format a moment for the client
const formatMoment = async (momentDoc: any, currentUserId: string | undefined) => {
  const author = momentDoc.authorId; // Populated User
  
  // Fetch comments for this moment
  const commentsDocs = await CommentModel.find({ momentId: momentDoc._id })
    .sort({ createdAt: 1 })
    .populate('authorId', 'alias avatarId name')
    .lean();
    
  const comments = commentsDocs.map((c: any) => ({
    id: c._id.toString(),
    author: c.authorId?.alias || c.authorId?.name || 'Unknown',
    avatarId: c.authorId?.avatarId || 'avatar-1',
    text: c.text,
    timestamp: c.createdAt.toISOString(),
  }));

  const likesCount = momentDoc.likes?.length || 0;
  const isLiked = currentUserId ? momentDoc.likes?.some((id: any) => id.toString() === currentUserId) : false;
  
  return {
    id: momentDoc._id.toString(),
    author: {
      name: author?.alias || author?.name || 'Unknown',
      handle: author?.username ? `@${author.username}` : `@user`,
      avatarId: author?.avatarId || 'avatar-1',
    },
    content: momentDoc.content,
    timestamp: momentDoc.createdAt.toISOString(),
    likes: likesCount,
    comments: comments,
    isLiked: isLiked,
    isMine: currentUserId ? author?._id?.toString() === currentUserId : false,
  };
};

// GET /moments
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const moments = await MomentModel.find()
      .sort({ createdAt: -1 })
      .populate('authorId', 'alias name username avatarId')
      .lean();
      
    const formattedMoments = await Promise.all(
      moments.map(m => formatMoment(m, req.user?.id))
    );

    res.json({
      success: true,
      data: formattedMoments,
    });
  } catch (error) {
    console.error('Error fetching moments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch moments' });
  }
});

// POST /moments
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content, mood } = req.body;
    
    if (!content) {
      res.status(400).json({ success: false, message: 'Content is required' });
      return;
    }

    const newMoment = await MomentModel.create({
      authorId: req.user?.id,
      content,
      mood,
      likes: [],
    });

    const populatedMoment = await MomentModel.findById(newMoment._id)
      .populate('authorId', 'alias name username avatarId')
      .lean();

    const formatted = await formatMoment(populatedMoment, req.user?.id);

    // Broadcast to all clients
    broadcastEvent('moment:created', formatted);

    res.status(201).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error('Error creating moment:', error);
    res.status(500).json({ success: false, message: 'Failed to create moment' });
  }
});

// POST /moments/:id/like
router.post('/:id/like', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const momentId = req.params['id'];
    const userId = req.user?.id;
    
    if (!userId) return;

    const moment = await MomentModel.findById(momentId);
    if (!moment) {
      res.status(404).json({ success: false, message: 'Moment not found' });
      return;
    }

    const likeIndex = moment.likes.findIndex(id => id.toString() === userId);
    
    if (likeIndex === -1) {
      // Add like
      moment.likes.push(userId as any);
    } else {
      // Remove like
      moment.likes.splice(likeIndex, 1);
    }

    await moment.save();

    const populatedMoment = await MomentModel.findById(momentId)
      .populate('authorId', 'alias name username avatarId')
      .lean();
      
    // Broadcast generic update without user specific fields like `isMine` or `isLiked` (clients handle this locally)
    const formattedEvent = await formatMoment(populatedMoment, undefined);
    broadcastEvent('moment:updated', { id: momentId, likes: formattedEvent.likes, comments: formattedEvent.comments });

    // Send personalized format back to the caller
    const formatted = await formatMoment(populatedMoment, userId);

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle like' });
  }
});

// POST /moments/:id/comments
router.post('/:id/comments', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const momentId = req.params['id'];
    const userId = req.user?.id;
    const { text } = req.body;
    
    if (!text) {
      res.status(400).json({ success: false, message: 'Comment text is required' });
      return;
    }

    const moment = await MomentModel.findById(momentId);
    if (!moment) {
      res.status(404).json({ success: false, message: 'Moment not found' });
      return;
    }

    await CommentModel.create({
      momentId,
      authorId: userId,
      text,
    });

    const populatedMoment = await MomentModel.findById(momentId)
      .populate('authorId', 'alias name username avatarId')
      .lean();
      
    const formattedEvent = await formatMoment(populatedMoment, undefined);
    broadcastEvent('moment:updated', { id: momentId, likes: formattedEvent.likes, comments: formattedEvent.comments });

    const formatted = await formatMoment(populatedMoment, userId);

    res.status(201).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
});

export default router;

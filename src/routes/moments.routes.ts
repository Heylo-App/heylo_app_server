import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { MomentModel } from '../models/Moment';
import { CommentModel } from '../models/Comment';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { broadcastEvent } from '../socket';
import { createAndSendActivity } from '../utils/activity';

const router = Router();

// Helper function to format a moment for the client
const formatMoment = async (momentDoc: any, currentUserId: string | undefined) => {
  const author = momentDoc.authorId; // Populated User
  
  // Fetch comments for this moment
  const commentsDocs = await CommentModel.find({ momentId: momentDoc._id })
    .sort({ createdAt: 1 })
    .populate('authorId', 'alias avatarId name username')
    .lean();
    
  const comments = commentsDocs.map((c: any) => ({
    id: c._id.toString(),
    authorId: c.authorId?._id?.toString() || '',
    author: c.authorId?.alias || c.authorId?.name || 'Unknown',
    username: c.authorId?.username || '',
    avatarId: c.authorId?.avatarId || 'avatar-1',
    text: c.text,
    parentId: c.parentId ? c.parentId.toString() : null,
    replyToUser: c.replyToUser || null,
    likes: c.likes?.length || 0,
    isLiked: currentUserId ? (c.likes || []).some((id: any) => id.toString() === currentUserId) : false,
    timestamp: c.createdAt.toISOString(),
  }));

  const likesCount = momentDoc.likes?.length || 0;
  const isLiked = currentUserId ? momentDoc.likes?.some((id: any) => id.toString() === currentUserId) : false;
  
  return {
    id: momentDoc._id.toString(),
    author: {
      id: author?._id?.toString() || '',
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

// GET /moments/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const momentId = req.params['id'] as string;
    if (!momentId || typeof momentId !== 'string' || !mongoose.Types.ObjectId.isValid(momentId)) {
      res.status(400).json({ success: false, message: 'Invalid moment ID' });
      return;
    }

    const moment = await MomentModel.findById(momentId)
      .populate('authorId', 'alias name username avatarId')
      .lean();

    if (!moment) {
      res.status(404).json({ success: false, message: 'Moment not found' });
      return;
    }

    const formatted = await formatMoment(moment, req.user?.id);
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching moment by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch moment' });
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
    const wasLiked = likeIndex === -1;
    
    if (wasLiked) {
      // Add like
      moment.likes.push(userId as any);
    } else {
      // Remove like
      moment.likes.splice(likeIndex, 1);
    }

    await moment.save();

    // Trigger activity notification if someone else liked the post
    if (wasLiked && moment.authorId && moment.authorId.toString() !== userId) {
      createAndSendActivity({
        recipientId: moment.authorId,
        actorId: userId,
        type: 'like_moment',
        momentId: moment._id,
        snippet: moment.content,
      }).catch((e) => console.error('[Activity] Failed to send moment like activity', e));
    }

    const populatedMoment = await MomentModel.findById(momentId)
      .populate('authorId', 'alias name username avatarId')
      .lean();
      
    // Broadcast generic update
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
    const { text, parentId, replyToUser } = req.body;
    
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'Comment text is required' });
      return;
    }

    const moment = await MomentModel.findById(momentId);
    if (!moment) {
      res.status(404).json({ success: false, message: 'Moment not found' });
      return;
    }

    const newComment = await CommentModel.create({
      momentId: new mongoose.Types.ObjectId(momentId as string),
      authorId: userId,
      text: text.trim(),
      parentId: parentId && mongoose.Types.ObjectId.isValid(parentId) ? new mongoose.Types.ObjectId(parentId as string) : null,
      replyToUser: replyToUser ? {
        id: replyToUser.id,
        username: replyToUser.username,
        name: replyToUser.name,
      } : undefined,
      likes: [],
    });

    // Notify users: mentions, replies, and moment author
    const notifiedUserIds = new Set<string>();
    if (userId) notifiedUserIds.add(userId);

    // 1. Mentions (@username)
    const mentionRegex = /@([a-zA-Z0-9_]{3,20})/g;
    const mentions: string[] = Array.from(
      new Set(Array.from(text.matchAll(mentionRegex), (m) => m[1]?.toLowerCase()))
    ).filter((u): u is string => Boolean(u));
    if (mentions.length > 0 && userId) {
      const mentionedUsers = await User.find({ username: { $in: mentions } }).select('_id');
      for (const mu of mentionedUsers) {
        const muId = mu._id.toString();
        if (!notifiedUserIds.has(muId)) {
          notifiedUserIds.add(muId);
          createAndSendActivity({
            recipientId: muId,
            actorId: userId,
            type: 'mention',
            momentId: moment._id,
            commentId: newComment._id,
            snippet: text,
          }).catch((e) => console.error('[Activity] Failed mention activity', e));
        }
      }
    }

    // 2. Direct reply to user or parent comment author
    const targetReplyUserId = replyToUser?.id;
    if (targetReplyUserId && userId && !notifiedUserIds.has(targetReplyUserId)) {
      notifiedUserIds.add(targetReplyUserId);
      createAndSendActivity({
        recipientId: targetReplyUserId,
        actorId: userId,
        type: 'reply_comment',
        momentId: moment._id,
        commentId: newComment._id,
        snippet: text,
      }).catch((e) => console.error('[Activity] Failed reply activity', e));
    } else if (parentId && mongoose.Types.ObjectId.isValid(parentId) && userId) {
      const parentComment = await CommentModel.findById(parentId).select('authorId');
      if (parentComment?.authorId) {
        const parentAuthorId = parentComment.authorId.toString();
        if (!notifiedUserIds.has(parentAuthorId)) {
          notifiedUserIds.add(parentAuthorId);
          createAndSendActivity({
            recipientId: parentAuthorId,
            actorId: userId,
            type: 'reply_comment',
            momentId: moment._id,
            commentId: newComment._id,
            snippet: text,
          }).catch((e) => console.error('[Activity] Failed parent comment reply activity', e));
        }
      }
    }

    // 3. Moment author (if not self and not already notified)
    const momentAuthorId = moment.authorId ? moment.authorId.toString() : '';
    if (momentAuthorId && userId && !notifiedUserIds.has(momentAuthorId)) {
      notifiedUserIds.add(momentAuthorId);
      createAndSendActivity({
        recipientId: momentAuthorId,
        actorId: userId,
        type: 'comment_moment',
        momentId: moment._id,
        commentId: newComment._id,
        snippet: text,
      }).catch((e) => console.error('[Activity] Failed comment moment activity', e));
    }

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

// POST /moments/:momentId/comments/:commentId/like
router.post('/:momentId/comments/:commentId/like', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const momentId = req.params['momentId'];
    const commentId = req.params['commentId'];
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const comment = await CommentModel.findOne({ _id: commentId, momentId });
    if (!comment) {
      res.status(404).json({ success: false, message: 'Comment not found' });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const likeIndex = (comment.likes || []).findIndex((id: any) => id.toString() === userId);
    const wasLiked = likeIndex === -1;
    
    if (wasLiked) {
      comment.likes = comment.likes || [];
      comment.likes.push(userObjectId);
    } else {
      comment.likes.splice(likeIndex, 1);
    }

    await comment.save();

    // Trigger activity notification if someone else liked the comment
    if (wasLiked && comment.authorId && comment.authorId.toString() !== userId && typeof momentId === 'string') {
      createAndSendActivity({
        recipientId: comment.authorId,
        actorId: userId,
        type: 'like_comment',
        momentId,
        commentId: comment._id,
        snippet: comment.text,
      }).catch((e) => console.error('[Activity] Failed to send comment like activity', e));
    }

    const populatedMoment = await MomentModel.findById(momentId)
      .populate('authorId', 'alias name username avatarId')
      .lean();

    if (!populatedMoment) {
      res.status(404).json({ success: false, message: 'Moment not found' });
      return;
    }

    const formattedEvent = await formatMoment(populatedMoment, undefined);
    broadcastEvent('moment:updated', { id: momentId, likes: formattedEvent.likes, comments: formattedEvent.comments });

    const formatted = await formatMoment(populatedMoment, userId);

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle comment like' });
  }
});

export default router;

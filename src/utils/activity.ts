import mongoose from 'mongoose';
import { ActivityModel, ActivityType } from '../models/Activity';
import { emitToUser } from '../socket';

export async function createAndSendActivity({
  recipientId,
  actorId,
  type,
  momentId,
  commentId,
  snippet,
}: {
  recipientId: string | mongoose.Types.ObjectId;
  actorId: string | mongoose.Types.ObjectId;
  type: ActivityType;
  momentId: string | mongoose.Types.ObjectId;
  commentId?: string | mongoose.Types.ObjectId;
  snippet?: string;
}) {
  const recipientStr = recipientId.toString();
  const actorStr = actorId.toString();

  // Never notify self-action
  if (recipientStr === actorStr) return null;

  try {
    const activity = await ActivityModel.create({
      recipientId: new mongoose.Types.ObjectId(recipientStr),
      actorId: new mongoose.Types.ObjectId(actorStr),
      type,
      momentId: new mongoose.Types.ObjectId(momentId.toString()),
      commentId: commentId ? new mongoose.Types.ObjectId(commentId.toString()) : undefined,
      snippet: snippet ? snippet.trim().slice(0, 120) : undefined,
      isRead: false,
    });

    const populated = await ActivityModel.findById(activity._id)
      .populate('actorId', 'alias username avatarId mood')
      .lean();

    if (!populated) return null;

    const unreadCount = await ActivityModel.countDocuments({
      recipientId: new mongoose.Types.ObjectId(recipientStr),
      isRead: false,
    });

    const formatted = {
      id: populated._id.toString(),
      recipientId: populated.recipientId.toString(),
      type: populated.type,
      momentId: populated.momentId.toString(),
      commentId: populated.commentId ? populated.commentId.toString() : null,
      snippet: populated.snippet || '',
      isRead: populated.isRead,
      createdAt: populated.createdAt.toISOString(),
      actor: {
        id: (populated.actorId as any)?._id?.toString() || '',
        alias: (populated.actorId as any)?.alias || 'Someone',
        username: (populated.actorId as any)?.username || '',
        avatarId: (populated.actorId as any)?.avatarId || 'avatar-1',
      },
    };

    // Real-time emit to the recipient
    emitToUser(recipientStr, 'activity:new', {
      activity: formatted,
      unreadCount,
    });

    return formatted;
  } catch (error) {
    console.error('[Activity] Error creating and sending activity:', error);
    return null;
  }
}

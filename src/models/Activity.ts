import mongoose, { Document, Schema } from 'mongoose';

export type ActivityType =
  | 'like_moment'
  | 'comment_moment'
  | 'reply_comment'
  | 'like_comment'
  | 'mention';

export interface IActivity extends Document {
  recipientId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  type: ActivityType;
  momentId: mongoose.Types.ObjectId;
  commentId?: mongoose.Types.ObjectId;
  snippet?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['like_moment', 'comment_moment', 'reply_comment', 'like_comment', 'mention'],
      required: true,
    },
    momentId: { type: Schema.Types.ObjectId, ref: 'Moment', required: true },
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    snippet: { type: String, trim: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ActivitySchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

export const ActivityModel = mongoose.model<IActivity>('Activity', ActivitySchema);

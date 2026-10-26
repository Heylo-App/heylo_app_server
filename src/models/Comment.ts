import mongoose, { Document, Schema } from 'mongoose';

export interface IComment extends Document {
  momentId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  text: string;
  parentId?: mongoose.Types.ObjectId | null;
  replyToUser?: {
    id?: string;
    username?: string;
    name?: string;
  };
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    momentId: { type: Schema.Types.ObjectId, ref: 'Moment', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 300 },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    replyToUser: {
      id: { type: String },
      username: { type: String },
      name: { type: String },
    },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export const CommentModel = mongoose.model<IComment>('Comment', CommentSchema);


import mongoose, { Document, Schema } from 'mongoose';

export interface IComment extends Document {
  momentId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    momentId: { type: Schema.Types.ObjectId, ref: 'Moment', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: true }
);

export const CommentModel = mongoose.model<IComment>('Comment', CommentSchema);

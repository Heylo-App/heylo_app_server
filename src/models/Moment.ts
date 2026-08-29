import mongoose, { Document, Schema } from 'mongoose';

export interface IMoment extends Document {
  authorId: mongoose.Types.ObjectId;
  content: string;
  mood: string;
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const MomentSchema = new Schema<IMoment>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 280 },
    mood: { type: String },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export const MomentModel = mongoose.model<IMoment>('Moment', MomentSchema);

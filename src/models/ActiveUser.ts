import mongoose, { Document, Schema } from 'mongoose';

export interface IActiveUser extends Document {
  userId: mongoose.Types.ObjectId;
  moodId: string;
  vibe: string;
  socketId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActiveUserSchema = new Schema<IActiveUser>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    moodId: { type: String, required: true },
    vibe: { type: String, required: true },
    socketId: { type: String, required: true },
  },
  { timestamps: true }
);

// Optional: auto-expire if we want them to fall off after some hours, 
// but we'll manually remove on disconnect.

export const ActiveUser = mongoose.model<IActiveUser>('ActiveUser', ActiveUserSchema);

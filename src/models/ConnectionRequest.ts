import mongoose, { Document, Schema } from 'mongoose';

export interface IConnectionRequest extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected' | 'timeout' | 'cancelled_matched';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConnectionRequestSchema = new Schema<IConnectionRequest>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'timeout', 'cancelled_matched'], default: 'pending' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const ConnectionRequest = mongoose.model<IConnectionRequest>('ConnectionRequest', ConnectionRequestSchema);

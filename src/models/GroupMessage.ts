import mongoose, { Document, Schema } from 'mongoose';

export interface IGroupMessage extends Document {
  groupId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  text: string;
  messageType?: 'text' | 'audio';
  audioData?: string;
  audioDuration?: number;
  createdAt: Date;
  updatedAt: Date;
}

const GroupMessageSchema = new Schema<IGroupMessage>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, default: '' },
    messageType: { type: String, enum: ['text', 'audio'], default: 'text' },
    audioData: { type: String },
    audioDuration: { type: Number },
  },
  { timestamps: true }
);

export const GroupMessage = mongoose.model<IGroupMessage>('GroupMessage', GroupMessageSchema);


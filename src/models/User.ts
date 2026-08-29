import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password?: string;
  username?: string;
  alias?: string;
  avatarId?: string;
  mood?: string;
  needs?: string[];
  language?: string;
  age?: string;
  reputation: number;
  isOnboarded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String }, // optional for future social logins, required for email/pwd
    username: { type: String, unique: true, sparse: true },
    alias: { type: String },
    avatarId: { type: String },
    mood: { type: String },
    needs: [{ type: String }],
    language: { type: String },
    age: { type: String },
    reputation: { type: Number, default: 0 },
    isOnboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);

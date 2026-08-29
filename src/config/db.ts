import mongoose from 'mongoose';
import { config } from './env';

export const connectDB = async () => {
  try {
    if (!config.databaseUrl) {
      console.warn('⚠️  DATABASE_URL is not defined in env. Skipping MongoDB connection.');
      return;
    }
    await mongoose.connect(config.databaseUrl);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.error('⚠️  Server will continue running, but database operations will fail.');
  }
};

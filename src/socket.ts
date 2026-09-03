import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { config } from './config/env';
import { GroupMessage } from './models/GroupMessage';
import { ActiveUser } from './models/ActiveUser';
import { ConnectionRequest } from './models/ConnectionRequest';
import { Chat } from './models/Chat';
import { ChatMessage } from './models/ChatMessage';
import { User } from './models/User';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ── Group Chat Events ──────────────────────────────────────────

    socket.on('join_group_room', async (groupId: string) => {
      socket.join(`group_${groupId}`);
      console.log(`Socket ${socket.id} joined group room: group_${groupId}`);
    });

    socket.on('leave_group_room', (groupId: string) => {
      socket.leave(`group_${groupId}`);
      console.log(`Socket ${socket.id} left group room: group_${groupId}`);
    });

    socket.on('send_group_message', async (data: { groupId: string; senderId: string; text: string; senderAlias: string; senderUsername: string; senderAvatarId: string }) => {
      try {
        const { groupId, senderId, text, senderAlias, senderUsername, senderAvatarId } = data;
        
        // Save to DB
        const msg = new GroupMessage({
          groupId,
          senderId,
          text
        });
        await msg.save();

        // Broadcast to everyone in the room (including sender, for immediate confirmation, or sender can use optimistic update)
        io.to(`group_${groupId}`).emit('receive_group_message', {
          _id: msg._id,
          groupId: msg.groupId,
          text: msg.text,
          createdAt: msg.createdAt,
          senderId: {
            _id: senderId,
            alias: senderAlias,
            username: senderUsername,
            avatarId: senderAvatarId
          }
        });
      } catch (error) {
        console.error('Socket send_group_message error:', error);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Remove from ActiveUser
      try {
        await ActiveUser.findOneAndDelete({ socketId: socket.id });
        io.emit('active_users_updated');
      } catch (err) {
        console.error('Error removing active user on disconnect:', err);
      }
    });

    // ── Explore / Active Users Events ───────────────────────────────

    // User joins with their own ID to receive direct requests
    socket.on('register_user', (userId: string) => {
      socket.join(`user_${userId}`);
    });

    socket.on('toggle_active', async (data: { userId: string; moodId: string; vibe: string; isActive: boolean }) => {
      try {
        if (data.isActive) {
          await ActiveUser.findOneAndUpdate(
            { userId: data.userId },
            { moodId: data.moodId, vibe: data.vibe, socketId: socket.id },
            { upsert: true, new: true }
          );
        } else {
          await ActiveUser.findOneAndDelete({ userId: data.userId });
        }
        // Broadcast to everyone that the list changed
        io.emit('active_users_updated');
      } catch (err) {
        console.error('toggle_active error:', err);
      }
    });

    socket.on('send_connect_request', async (data: { senderId: string; receiverId: string }) => {
      try {
        const { senderId, receiverId } = data;
        // Check if there's an existing pending request
        const existing = await ConnectionRequest.findOne({ senderId, receiverId, status: 'pending' });
        if (existing) return;

        const expiresAt = new Date(Date.now() + 15 * 1000); // 15 seconds
        const req = new ConnectionRequest({
          senderId,
          receiverId,
          status: 'pending',
          expiresAt,
        });
        await req.save();

        // Get sender details
        const sender = await User.findById(senderId).select('alias username avatarId mood');

        // Emit to receiver
        io.to(`user_${receiverId}`).emit('receive_connect_request', {
          id: req._id,
          senderId: senderId,
          alias: sender?.alias,
          username: sender?.username,
          avatarId: sender?.avatarId,
          moodId: sender?.mood,
          expiresAt,
        });

      } catch (err) {
        console.error('send_connect_request error:', err);
      }
    });

    socket.on('find_match', async (data: { senderId: string; moodId: string }) => {
      try {
        const { senderId, moodId } = data;
        console.log(`[find_match] senderId=${senderId}, moodId=${moodId}`);
        
        // Cast senderId to ObjectId for proper comparison
        const senderObjectId = new mongoose.Types.ObjectId(senderId);

        // Find matching active users (exclude the sender)
        const query: any = { userId: { $ne: senderObjectId } };
        if (moodId && moodId !== 'any') {
          query.moodId = moodId;
        }

        const activeUsers = await ActiveUser.find(query);
        console.log(`[find_match] Found ${activeUsers.length} active users matching query`);

        const expiresAt = new Date(Date.now() + 15 * 1000); // 15 seconds
        const sender = await User.findById(senderId).select('alias username avatarId mood');

        let sentCount = 0;

        for (const activeUser of activeUsers) {
          // Check for existing pending request
          const existing = await ConnectionRequest.findOne({ senderId: senderObjectId, receiverId: activeUser.userId, status: 'pending' });
          if (existing) continue;

          const req = new ConnectionRequest({
            senderId: senderObjectId,
            receiverId: activeUser.userId,
            status: 'pending',
            expiresAt,
          });
          await req.save();

          // Emit to receiver
          io.to(`user_${activeUser.userId}`).emit('receive_connect_request', {
            id: req._id,
            senderId: senderId,
            alias: sender?.alias,
            username: sender?.username,
            avatarId: sender?.avatarId,
            moodId: sender?.mood,
            expiresAt,
          });
          sentCount++;
        }

        console.log(`[find_match] Sent ${sentCount} requests`);
        socket.emit('find_match_result', { sentCount });

      } catch (err) {
        console.error('find_match error:', err);
        // Always respond so client doesn't hang
        socket.emit('find_match_result', { sentCount: 0 });
      }
    });

    socket.on('accept_connect_request', async (requestId: string) => {
      try {
        // Atomic update: only succeeds if status is still 'pending'
        const req = await ConnectionRequest.findOneAndUpdate(
          { _id: requestId, status: 'pending' },
          { status: 'accepted' },
          { new: true }
        );

        if (!req) {
          // Request was already handled (accepted by someone else or cancelled)
          const existingReq = await ConnectionRequest.findById(requestId);
          if (existingReq && existingReq.status === 'cancelled_matched') {
            socket.emit('connect_request_error', {
              requestId,
              message: 'User is already matched with someone else.',
            });
          }
          return;
        }

        // Cancel all other pending requests from this sender
        await ConnectionRequest.updateMany(
          { senderId: req.senderId, status: 'pending', _id: { $ne: req._id } },
          { status: 'cancelled_matched' }
        );

        // Check if chat already exists
        let chat = await Chat.findOne({
          participants: { $all: [req.senderId, req.receiverId], $size: 2 }
        });

        if (!chat) {
          chat = new Chat({ participants: [req.senderId, req.receiverId] });
          await chat.save();
        }

        // Notify both users to join the chat
        io.to(`user_${req.senderId}`).emit('connect_request_accepted', { chatId: chat._id });
        io.to(`user_${req.receiverId}`).emit('connect_request_accepted', { chatId: chat._id });
      } catch (err) {
        console.error('accept_connect_request error:', err);
      }
    });

    socket.on('decline_connect_request', async (requestId: string) => {
      try {
        await ConnectionRequest.findByIdAndUpdate(requestId, { status: 'rejected' });
      } catch (err) {
        console.error('decline_connect_request error:', err);
      }
    });

    // ── 1-on-1 Chat Events ─────────────────────────────────────────

    socket.on('join_chat_room', (chatId: string) => {
      socket.join(`chat_${chatId}`);
    });

    socket.on('leave_chat_room', (chatId: string) => {
      socket.leave(`chat_${chatId}`);
    });

    socket.on('send_chat_message', async (data: { chatId: string; senderId: string; text: string; senderAlias?: string; senderAvatarId?: string }) => {
      try {
        const { chatId, senderId, text } = data;
        const msg = new ChatMessage({ chatId, senderId, text });
        await msg.save();

        await Chat.findByIdAndUpdate(chatId, { lastMessageAt: new Date(), lastMessageText: text });

        io.to(`chat_${chatId}`).emit('receive_chat_message', {
          _id: msg._id,
          chatId,
          text,
          createdAt: msg.createdAt,
          senderId: {
            _id: senderId,
            alias: data.senderAlias,
            avatarId: data.senderAvatarId,
          }
        });
      } catch (err) {
        console.error('send_chat_message error:', err);
      }
    });

  });

  return io;
};

// Expose a function to broadcast events to all connected clients
export const broadcastEvent = (event: string, payload: any) => {
  if (io) {
    io.emit(event, payload);
  }
};

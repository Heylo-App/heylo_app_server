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
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

export const getIO = (): Server | undefined => io;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Group Chat Events ──────────────────────────────────────────

    socket.on('join_group_room', (groupId: string) => {
      socket.join(`group_${groupId}`);
      console.log(`[Socket] ${socket.id} joined group room: group_${groupId}`);
    });

    socket.on('leave_group_room', (groupId: string) => {
      socket.leave(`group_${groupId}`);
      console.log(`[Socket] ${socket.id} left group room: group_${groupId}`);
    });

    socket.on(
      'send_group_message',
      async (data: {
        groupId: string;
        senderId: string;
        text: string;
        senderAlias: string;
        senderUsername: string;
        senderAvatarId: string;
      }) => {
        try {
          const { groupId, senderId, text, senderAlias, senderUsername, senderAvatarId } = data;
          const msg = new GroupMessage({ groupId, senderId, text });
          await msg.save();

          io.to(`group_${groupId}`).emit('receive_group_message', {
            _id: msg._id,
            groupId: msg.groupId,
            text: msg.text,
            createdAt: msg.createdAt,
            senderId: {
              _id: senderId,
              alias: senderAlias,
              username: senderUsername,
              avatarId: senderAvatarId,
            },
          });
        } catch (error) {
          console.error('[Socket] send_group_message error:', error);
        }
      }
    );

    // ── Disconnect & Cleanup ───────────────────────────────────────

    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const userId = (socket as any).userId;

      try {
        let active = null;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
          active = await ActiveUser.findOne({ userId: new mongoose.Types.ObjectId(userId) });
        } else {
          active = await ActiveUser.findOne({ socketId: socket.id });
        }

        if (active) {
          const userIdStr = active.userId.toString();
          if (disconnectTimeouts.has(userIdStr)) {
            clearTimeout(disconnectTimeouts.get(userIdStr)!);
          }

          // 8-second grace period for quick app switch or re-render
          const timer = setTimeout(async () => {
            disconnectTimeouts.delete(userIdStr);
            try {
              // Delete if still bound to this socket or inactive
              const current = await ActiveUser.findOne({ userId: active.userId });
              if (current && current.socketId === socket.id) {
                await ActiveUser.findOneAndDelete({ userId: active.userId });
                io.emit('active_users_updated');

                // Cancel pending requests involving this disconnected user
                const pending = await ConnectionRequest.find({
                  $or: [{ senderId: active.userId }, { receiverId: active.userId }],
                  status: 'pending',
                });

                if (pending.length > 0) {
                  await ConnectionRequest.updateMany(
                    { _id: { $in: pending.map((r) => r._id) } },
                    { status: 'cancelled_inactive' }
                  );
                  for (const req of pending) {
                    const otherId =
                      req.senderId.toString() === userIdStr
                        ? req.receiverId.toString()
                        : req.senderId.toString();
                    io.to(`user_${otherId}`).emit('connect_request_cancelled', {
                      requestId: req._id.toString(),
                      reason: 'User disconnected',
                    });
                  }
                }
              }
            } catch (err) {
              console.error('[Socket] Error removing active user after grace period:', err);
            }
          }, 8000);

          disconnectTimeouts.set(userIdStr, timer);
        }
      } catch (err) {
        console.error('[Socket] Error on disconnect:', err);
      }
    });

    // ── Explore / Active Users Events ───────────────────────────────

    // User joins with their own ID to receive direct requests
    socket.on('register_user', async (userId: string) => {
      if (!userId) return;
      (socket as any).userId = userId;
      socket.join(`user_${userId}`);
      console.log(`[Socket] ${socket.id} registered user room: user_${userId}`);

      // Clear any pending disconnect cleanup timer for this user
      if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId)!);
        disconnectTimeouts.delete(userId);
      }

      // Re-bind active user record's socketId to this new connection
      try {
        if (mongoose.Types.ObjectId.isValid(userId)) {
          const updated = await ActiveUser.findOneAndUpdate(
            { userId: new mongoose.Types.ObjectId(userId) },
            { socketId: socket.id },
            { new: true }
          );
          if (updated) {
            io.emit('active_users_updated');
          }

          // Check if there are unexpired incoming pending requests for this user, deliver them
          const pendingIncoming = await ConnectionRequest.find({
            receiverId: new mongoose.Types.ObjectId(userId),
            status: 'pending',
            expiresAt: { $gt: new Date() },
          }).populate('senderId', 'alias username avatarId mood');

          for (const req of pendingIncoming) {
            const sender: any = req.senderId;
            socket.emit('receive_connect_request', {
              id: req._id.toString(),
              senderId: sender?._id?.toString() || req.senderId.toString(),
              alias: sender?.alias || sender?.username || 'Anonymous',
              username: sender?.username || '',
              avatarId: sender?.avatarId || 'avatar-1',
              moodId: sender?.mood || 'calm',
              expiresAt: req.expiresAt,
            });
          }
        }
      } catch (err) {
        console.error('[Socket] Error re-binding active user on register_user:', err);
      }
    });

    socket.on(
      'toggle_active',
      async (data: { userId: string; moodId: string; vibe: string; isActive: boolean }) => {
        try {
          if (!data.userId || !mongoose.Types.ObjectId.isValid(data.userId)) return;
          const userObjId = new mongoose.Types.ObjectId(data.userId);

          if (disconnectTimeouts.has(data.userId)) {
            clearTimeout(disconnectTimeouts.get(data.userId)!);
            disconnectTimeouts.delete(data.userId);
          }

          if (data.isActive) {
            await ActiveUser.findOneAndUpdate(
              { userId: userObjId },
              { userId: userObjId, moodId: data.moodId, vibe: data.vibe, socketId: socket.id },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          } else {
            await ActiveUser.findOneAndDelete({ userId: userObjId });

            // Clean up all pending requests involving this newly inactive user
            const pending = await ConnectionRequest.find({
              $or: [{ senderId: userObjId }, { receiverId: userObjId }],
              status: 'pending',
            });

            if (pending.length > 0) {
              await ConnectionRequest.updateMany(
                { _id: { $in: pending.map((r) => r._id) } },
                { status: 'cancelled_inactive' }
              );
              for (const req of pending) {
                const otherId =
                  req.senderId.toString() === data.userId
                    ? req.receiverId.toString()
                    : req.senderId.toString();
                io.to(`user_${otherId}`).emit('connect_request_cancelled', {
                  requestId: req._id.toString(),
                  reason: 'User became inactive',
                });
              }
            }
          }

          // Broadcast to everyone that the list changed
          io.emit('active_users_updated');
        } catch (err) {
          console.error('[Socket] toggle_active error:', err);
        }
      }
    );

    // ── Connect Requests ───────────────────────────────────────────

    socket.on('send_connect_request', async (data: { senderId: string; receiverId: string }) => {
      try {
        const { senderId, receiverId } = data;
        console.log(`[send_connect_request] From sender=${senderId} to receiver=${receiverId}`);
        if (!senderId || !receiverId) {
          socket.emit('connect_request_error', { message: 'Missing sender or receiver' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
          socket.emit('connect_request_error', { message: 'Invalid sender or receiver ID' });
          return;
        }

        const senderObjectId = new mongoose.Types.ObjectId(senderId);
        const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

        // Check if receiver is still active
        const receiverActive = await ActiveUser.findOne({ userId: receiverObjectId });
        if (!receiverActive) {
          socket.emit('connect_request_error', { message: 'User is no longer active.' });
          return;
        }

        // Expire any stale pending requests between these two users
        await ConnectionRequest.updateMany(
          {
            senderId: senderObjectId,
            receiverId: receiverObjectId,
            status: 'pending',
            expiresAt: { $lte: new Date() },
          },
          { status: 'timeout' }
        );

        // Fetch sender details
        const sender = await User.findById(senderId).select('alias username avatarId mood');
        const senderActive = await ActiveUser.findOne({ userId: senderObjectId });

        // Check if there is an active unexpired pending request
        let req = await ConnectionRequest.findOne({
          senderId: senderObjectId,
          receiverId: receiverObjectId,
          status: 'pending',
          expiresAt: { $gt: new Date() },
        });

        if (!req) {
          const expiresAt = new Date(Date.now() + 15 * 1000); // 15 seconds
          req = new ConnectionRequest({
            senderId: senderObjectId,
            receiverId: receiverObjectId,
            status: 'pending',
            expiresAt,
          });
          await req.save();
        }

        const payload = {
          id: req._id.toString(),
          senderId: senderId,
          alias: sender?.alias || sender?.username || 'Anonymous',
          username: sender?.username || '',
          avatarId: sender?.avatarId || 'avatar-1',
          moodId: sender?.mood || 'calm',
          vibe: senderActive?.vibe || '',
          expiresAt: req.expiresAt,
        };

        console.log(`[send_connect_request] Emitting receive_connect_request to user_${receiverId}`);
        io.to(`user_${receiverId}`).emit('receive_connect_request', payload);

        // Confirm to sender that request was sent
        socket.emit('connect_request_sent', {
          requestId: req._id.toString(),
          receiverId,
          expiresAt: req.expiresAt,
        });
      } catch (err) {
        console.error('[Socket] send_connect_request error:', err);
        socket.emit('connect_request_error', { message: 'Could not send connection request' });
      }
    });

    socket.on('cancel_connect_request', async (requestId: string) => {
      try {
        console.log(`[cancel_connect_request] requestId=${requestId}`);
        if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) return;

        const req = await ConnectionRequest.findByIdAndUpdate(
          new mongoose.Types.ObjectId(requestId),
          { status: 'cancelled' },
          { new: true }
        );

        if (req) {
          io.to(`user_${req.receiverId}`).emit('connect_request_cancelled', {
            requestId: req._id.toString(),
            reason: 'Sender cancelled request',
          });
          io.to(`user_${req.senderId}`).emit('connect_request_cancelled', {
            requestId: req._id.toString(),
            reason: 'You cancelled the request',
          });
        }
      } catch (err) {
        console.error('[Socket] cancel_connect_request error:', err);
      }
    });

    socket.on('accept_connect_request', async (requestId: string) => {
      try {
        console.log(`[accept_connect_request] requestId=${requestId}`);
        if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
          socket.emit('connect_request_error', { message: 'Invalid request ID' });
          return;
        }

        const reqObjectId = new mongoose.Types.ObjectId(requestId);

        // Atomic update: only succeeds if status is still 'pending'
        const req = await ConnectionRequest.findOneAndUpdate(
          { _id: reqObjectId, status: 'pending' },
          { status: 'accepted' },
          { new: true }
        );

        if (!req) {
          console.warn(`[accept_connect_request] Request not found or not pending: ${requestId}`);
          socket.emit('connect_request_error', {
            requestId,
            message: 'Request has expired or was already answered.',
          });
          return;
        }

        // Cancel other pending requests from or to both users
        await ConnectionRequest.updateMany(
          {
            $or: [
              { senderId: req.senderId },
              { receiverId: req.senderId },
              { senderId: req.receiverId },
              { receiverId: req.receiverId },
            ],
            status: 'pending',
            _id: { $ne: req._id },
          },
          { status: 'cancelled_matched' }
        );

        // Remove both users from active pool now that they are in an active connection
        await ActiveUser.deleteMany({
          userId: { $in: [req.senderId, req.receiverId] },
        });
        io.emit('active_users_updated');

        // Check if chat already exists
        let chat = await Chat.findOne({
          participants: { $all: [req.senderId, req.receiverId], $size: 2 },
        });

        if (!chat) {
          chat = new Chat({ participants: [req.senderId, req.receiverId] });
          await chat.save();
        }

        const chatIdStr = chat._id.toString();
        console.log(
          `[accept_connect_request] Chat ready: ${chatIdStr}. Notifying sender user_${req.senderId} and receiver user_${req.receiverId}`
        );

        const acceptPayload = {
          chatId: chatIdStr,
          requestId: req._id.toString(),
          senderId: req.senderId.toString(),
          receiverId: req.receiverId.toString(),
        };

        // Notify both users to join the chat
        io.to(`user_${req.senderId}`).emit('connect_request_accepted', acceptPayload);
        io.to(`user_${req.receiverId}`).emit('connect_request_accepted', acceptPayload);
      } catch (err) {
        console.error('[Socket] accept_connect_request error:', err);
      }
    });

    socket.on('decline_connect_request', async (requestId: string) => {
      try {
        console.log(`[decline_connect_request] requestId=${requestId}`);
        if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) return;

        const req = await ConnectionRequest.findByIdAndUpdate(
          new mongoose.Types.ObjectId(requestId),
          { status: 'rejected' },
          { new: true }
        );

        if (req) {
          io.to(`user_${req.senderId}`).emit('connect_request_cancelled', {
            requestId: req._id.toString(),
            reason: 'Request was declined',
          });
        }
      } catch (err) {
        console.error('[Socket] decline_connect_request error:', err);
      }
    });

    socket.on('find_match', async (data: { senderId: string; moodId: string }) => {
      try {
        const { senderId, moodId } = data;
        if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
          socket.emit('find_match_result', { sentCount: 0 });
          return;
        }

        const senderObjectId = new mongoose.Types.ObjectId(senderId);
        const query: any = { userId: { $ne: senderObjectId } };
        if (moodId && moodId !== 'any') {
          query.moodId = moodId;
        }

        const activeUsers = await ActiveUser.find(query);
        const expiresAt = new Date(Date.now() + 15 * 1000);
        const sender = await User.findById(senderId).select('alias username avatarId mood');
        const senderActive = await ActiveUser.findOne({ userId: senderObjectId });

        let sentCount = 0;

        for (const activeUser of activeUsers) {
          const existing = await ConnectionRequest.findOne({
            senderId: senderObjectId,
            receiverId: activeUser.userId,
            status: 'pending',
            expiresAt: { $gt: new Date() },
          });
          if (existing) continue;

          const req = new ConnectionRequest({
            senderId: senderObjectId,
            receiverId: activeUser.userId,
            status: 'pending',
            expiresAt,
          });
          await req.save();

          io.to(`user_${activeUser.userId}`).emit('receive_connect_request', {
            id: req._id.toString(),
            senderId: senderId,
            alias: sender?.alias || sender?.username || 'Anonymous',
            username: sender?.username || '',
            avatarId: sender?.avatarId || 'avatar-1',
            moodId: sender?.mood || 'calm',
            vibe: senderActive?.vibe || '',
            expiresAt,
          });
          sentCount++;
        }

        socket.emit('find_match_result', { sentCount });
      } catch (err) {
        console.error('[Socket] find_match error:', err);
        socket.emit('find_match_result', { sentCount: 0 });
      }
    });

    // ── 1-on-1 Chat Events ─────────────────────────────────────────

    socket.on('join_chat_room', (chatId: string) => {
      if (!chatId) return;
      socket.join(`chat_${chatId}`);
      console.log(`[Socket] ${socket.id} joined chat room: chat_${chatId}`);
    });

    socket.on('leave_chat_room', (chatId: string) => {
      if (!chatId) return;
      socket.leave(`chat_${chatId}`);
      console.log(`[Socket] ${socket.id} left chat room: chat_${chatId}`);
      socket.to(`chat_${chatId}`).emit('peer_left_chat', {
        chatId,
        message: 'Your peer has left the chat.',
      });
    });

    socket.on('close_chat', async (data: { chatId: string; userId: string }) => {
      try {
        const { chatId, userId } = data;
        if (!chatId) return;
        io.to(`chat_${chatId}`).emit('chat_closed', {
          chatId,
          closedBy: userId,
          message: 'Connection closed.',
        });
      } catch (err) {
        console.error('[Socket] close_chat error:', err);
      }
    });

    socket.on(
      'send_chat_message',
      async (data: {
        chatId: string;
        senderId: string;
        text: string;
        senderAlias?: string;
        senderAvatarId?: string;
      }) => {
        try {
          const { chatId, senderId, text } = data;
          if (!chatId || !senderId || !text) return;

          const msg = new ChatMessage({ chatId, senderId, text });
          await msg.save();

          await Chat.findByIdAndUpdate(chatId, {
            lastMessageAt: new Date(),
            lastMessageText: text,
          });

          const msgPayload = {
            _id: msg._id,
            chatId,
            text,
            createdAt: msg.createdAt,
            senderId: {
              _id: senderId,
              alias: data.senderAlias,
              avatarId: data.senderAvatarId,
            },
          };

          // Emit to chat room
          io.to(`chat_${chatId}`).emit('receive_chat_message', msgPayload);

          // Also emit to the participants' individual user rooms as backup
          const chat = await Chat.findById(chatId);
          if (chat) {
            for (const p of chat.participants) {
              io.to(`user_${p.toString()}`).emit('receive_chat_message', msgPayload);
            }
          }
        } catch (err) {
          console.error('[Socket] send_chat_message error:', err);
        }
      }
    );
  });

  return io;
};

// Expose a function to broadcast events to all connected clients
export const broadcastEvent = (event: string, payload?: any) => {
  if (io) {
    io.emit(event, payload);
  }
};

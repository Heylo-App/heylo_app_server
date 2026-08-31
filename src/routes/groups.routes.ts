import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { Group } from '../models/Group';
import { GroupMember } from '../models/GroupMember';
import { GroupMessage } from '../models/GroupMessage';
import { GroupInvite } from '../models/GroupInvite';
import { User } from '../models/User';
import crypto from 'crypto';

const router = Router();

// POST /groups (Create group)
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Group name is required' });
      return;
    }

    const inviteCode = crypto.randomBytes(6).toString('hex'); // 12-char string

    const group = new Group({
      name,
      description,
      adminId: req.user?.id,
      inviteCode,
    });
    await group.save();

    // Add admin as a member automatically
    const member = new GroupMember({
      groupId: group._id,
      userId: req.user?.id,
    });
    await member.save();

    res.status(201).json({ success: true, data: group });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /groups (List user's joined groups)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memberships = await GroupMember.find({ userId: req.user?.id }).lean();
    const groupIds = memberships.map(m => m.groupId);

    const groups = await Group.find({ _id: { $in: groupIds } }).lean();

    // We can also fetch the latest message for each group here to show in the list, 
    // but for simplicity we'll just return the groups.
    res.json({ success: true, data: groups });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /groups/invite/:inviteCode (Preview group info)
router.get('/invite/:inviteCode', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findOne({ inviteCode: req.params['inviteCode'] })
      .populate('adminId', 'alias username avatarId')
      .lean();
      
    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found or invalid link' });
      return;
    }

    // Check if already a member
    const isMember = await GroupMember.exists({ groupId: group._id, userId: req.user?.id });

    res.json({ success: true, data: { ...group, isMember: !!isMember } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /groups/invite/:inviteCode/join (Join group)
router.post('/invite/:inviteCode/join', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findOne({ inviteCode: req.params['inviteCode'] });
    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const existing = await GroupMember.findOne({ groupId: group._id, userId: req.user?.id });
    if (existing) {
      res.status(400).json({ success: false, message: 'Already a member' });
      return;
    }

    const member = new GroupMember({
      groupId: group._id,
      userId: req.user?.id,
    });
    await member.save();

    res.json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /groups/invites (List pending invites for the user)
router.get('/invites', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invites = await GroupInvite.find({ inviteeId: req.user?.id, status: 'pending' })
      .populate('groupId', 'name description')
      .populate('inviterId', 'alias username avatarId')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ success: true, data: invites });
  } catch (error) {
    console.error('List invites error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /groups/invites/:inviteId/accept
router.post('/invites/:inviteId/accept', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invite = await GroupInvite.findOne({ _id: req.params['inviteId'], inviteeId: req.user?.id, status: 'pending' });
    if (!invite) {
      res.status(404).json({ success: false, message: 'Invite not found or already processed' });
      return;
    }

    // Mark as accepted
    invite.status = 'accepted';
    await invite.save();

    // Check if group still exists
    const group = await Group.findById(invite.groupId);
    if (!group) {
      res.status(404).json({ success: false, message: 'Group no longer exists' });
      return;
    }

    // Add to members if not already
    const existingMember = await GroupMember.findOne({ groupId: group._id, userId: req.user?.id });
    if (!existingMember) {
      const member = new GroupMember({
        groupId: group._id,
        userId: req.user?.id,
      });
      await member.save();
    }

    res.json({ success: true, message: 'Joined group successfully', data: group });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /groups/invites/:inviteId/decline
router.post('/invites/:inviteId/decline', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invite = await GroupInvite.findOne({ _id: req.params['inviteId'], inviteeId: req.user?.id, status: 'pending' });
    if (!invite) {
      res.status(404).json({ success: false, message: 'Invite not found or already processed' });
      return;
    }

    // Mark as declined
    invite.status = 'declined';
    await invite.save();

    res.json({ success: true, message: 'Invite declined' });
  } catch (error) {
    console.error('Decline invite error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Dynamic :groupId routes (MUST come after static routes) ──

// GET /groups/:groupId/messages
router.get('/:groupId/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isMember = await GroupMember.exists({ groupId: req.params['groupId'], userId: req.user?.id });
    if (!isMember) {
      res.status(403).json({ success: false, message: 'Not a member of this group' });
      return;
    }

    const messages = await GroupMessage.find({ groupId: req.params['groupId'] })
      .populate('senderId', 'alias username avatarId')
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /groups/:groupId/info
router.get('/:groupId/info', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isMember = await GroupMember.exists({ groupId: req.params['groupId'], userId: req.user?.id });
    if (!isMember) {
      res.status(403).json({ success: false, message: 'Not a member of this group' });
      return;
    }

    const group = await Group.findById(req.params['groupId'])
      .populate('adminId', 'alias username avatarId')
      .lean();
      
    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const members = await GroupMember.find({ groupId: group._id })
      .populate('userId', 'alias username avatarId mood')
      .lean();

    res.json({ success: true, data: { ...group, members: members.map(m => m.userId) } });
  } catch (error) {
    console.error('Get group info error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /groups/:groupId (Delete group entirely)
router.delete('/:groupId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params['groupId']);
    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    if (group.adminId.toString() !== req.user?.id) {
      res.status(403).json({ success: false, message: 'Only admin can delete group' });
      return;
    }

    await GroupMessage.deleteMany({ groupId: group._id });
    await GroupMember.deleteMany({ groupId: group._id });
    await group.deleteOne();

    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /groups/:groupId/leave
router.post('/:groupId/leave', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const group = await Group.findById(req.params['groupId']);
    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    const isMember = await GroupMember.findOne({ groupId: group._id, userId: req.user?.id });
    if (!isMember) {
      res.status(400).json({ success: false, message: 'Not a member' });
      return;
    }

    if (group.adminId.toString() === req.user?.id) {
      const memberCount = await GroupMember.countDocuments({ groupId: group._id });
      if (memberCount > 1) {
        res.status(400).json({ success: false, message: 'Admin must transfer ownership before leaving or delete the group' });
        return;
      }
      // If admin is the only member, just delete the group
      await GroupMessage.deleteMany({ groupId: group._id });
      await group.deleteOne();
    }

    await isMember.deleteOne();
    res.json({ success: true, message: 'Left group' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /groups/:groupId/add-member
router.post('/:groupId/add-member', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ success: false, message: 'Username is required' });
      return;
    }

    const group = await Group.findById(req.params['groupId']);
    if (!group) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }

    // Only allow members to add other members
    const isMember = await GroupMember.exists({ groupId: group._id, userId: req.user?.id });
    if (!isMember) {
      res.status(403).json({ success: false, message: 'Not a member' });
      return;
    }

    const userToAdd = await User.findOne({ username });
    if (!userToAdd) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const alreadyMember = await GroupMember.exists({ groupId: group._id, userId: userToAdd._id });
    if (alreadyMember) {
      res.status(400).json({ success: false, message: 'User is already a member' });
      return;
    }

    const existingInvite = await GroupInvite.findOne({ groupId: group._id, inviteeId: userToAdd._id, status: 'pending' });
    if (existingInvite) {
      res.status(400).json({ success: false, message: 'Invite request already sent to this user' });
      return;
    }

    const invite = new GroupInvite({
      groupId: group._id,
      inviterId: req.user?.id,
      inviteeId: userToAdd._id,
      status: 'pending',
    });
    await invite.save();

    res.json({ success: true, message: 'Invite request sent to user' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

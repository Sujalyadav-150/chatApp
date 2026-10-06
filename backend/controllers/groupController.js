const Group = require("../models/Group");
const User = require("../models/User");
const { createGroupRoomId } = require("../utils/room");

function publicGroup(group) {
  return {
    id: group._id,
    name: group.name,
    roomId: group.roomId,
    createdBy: group.createdBy,
    members: (group.members || []).map((m) =>
      m && m._id ? { id: m._id, name: m.name, email: m.email } : m
    )
  };
}

// POST /api/groups  { name, memberEmails: [] }
exports.createGroup = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const memberEmails = Array.isArray(req.body.memberEmails) ? req.body.memberEmails : [];

    if (!name) {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    const emails = [...new Set(memberEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

    if (!emails.length) {
      return res.status(400).json({ success: false, message: "Select at least one member" });
    }

    // Backend validation: every selected member must be a real user.
    const users = await User.find({ email: { $in: emails } }).select("_id");

    if (users.length !== emails.length) {
      return res
        .status(400)
        .json({ success: false, message: "One or more selected users do not exist" });
    }

    // Always include the creator, never duplicate anyone.
    const memberIds = [...new Set([String(req.user.id), ...users.map((u) => String(u._id))])];

    // Create first so we can use the generated _id for a deterministic room id.
    const group = await Group.create({
      name,
      roomId: "pending",
      members: memberIds,
      createdBy: req.user.id
    });

    group.roomId = createGroupRoomId(group._id);
    await group.save();

    const populated = await group.populate("members", "name email");

    res.status(201).json({ success: true, message: "Group created", group: publicGroup(populated) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/groups - groups the current user belongs to.
exports.getMyGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user.id })
      .populate("members", "name email")
      .sort({ updatedAt: -1 });

    res.json({ success: true, groups: groups.map(publicGroup) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/groups/:id - single group (members only).
exports.getGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).populate("members", "name email");

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const isMember = group.members.some((m) => String(m._id) === String(req.user.id));
    if (!isMember) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    res.json({ success: true, group: publicGroup(group) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
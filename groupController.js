const { KeduGroup } = require('./models');

function genGroupId() {
  return 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2,6);
}

exports.createGroup = async (req, res) => {
  try {
    const { groupName, memberPhones, groupPhoto, description } = req.body;
    const myPhone = req.user.phoneNumber;
    console.log("Create group request:", groupName, memberPhones, "by", myPhone);
    if (!groupName ||!memberPhones || memberPhones.length < 1) {
      return res.status(400).json({ error: "Group name and at least 1 member required" });
    }
    let allMembers = [...new Set([myPhone,...memberPhones])];
    const groupId = genGroupId();
    const roomId = groupId;
    const group = await KeduGroup.create({
      groupId,
      roomId,
      groupName: groupName.trim(),
      groupPhoto: groupPhoto || "",
      description: description || "",
      adminPhones: [myPhone],
      memberPhones: allMembers,
      members: allMembers,
      createdBy: myPhone
    });
    console.log("Group created:", group.groupId, "members:", allMembers.length);
    res.json({ success: true, group });
  } catch (err) {
    console.error("createGroup error", err);
    res.status(500).json({ error: "Failed to create group" });
  }
};

exports.myGroups = async (req, res) => {
  try {
    const myPhone = req.user.phoneNumber;
    const groups = await KeduGroup.find({ memberPhones: myPhone }).sort({ createdAt: -1 });
    const enriched = groups.map(g => {
      const obj = g.toObject();
      obj.members = obj.memberPhones;
      return obj;
    });
    console.log(`myGroups for ${myPhone}: ${enriched.length} groups`);
    res.json({ groups: enriched });
  } catch (err) {
    console.error("myGroups error", err);
    res.status(500).json({ error: "Failed to get groups" });
  }
};

exports.addMembers = async (req, res) => {
  try {
    const { groupId, newPhones } = req.body;
    const myPhone = req.user.phoneNumber;
    const group = await KeduGroup.findOne({ groupId });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.adminPhones.includes(myPhone)) return res.status(403).json({ error: "Only admin can add" });
    let updated = [...new Set([...group.memberPhones,...newPhones])];
    group.memberPhones = updated;
    group.members = updated;
    await group.save();
    res.json({ success: true, group });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
};

exports.removeMember = async (req, res) => {
  try {
    const { groupId, phoneToRemove } = req.body;
    const myPhone = req.user.phoneNumber;
    const group = await KeduGroup.findOne({ groupId });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.adminPhones.includes(myPhone)) return res.status(403).json({ error: "Only admin" });
    if (phoneToRemove === group.createdBy) return res.status(400).json({ error: "Cannot remove creator" });
    group.memberPhones = group.memberPhones.filter(p => p!== phoneToRemove);
    group.members = group.memberPhones;
    group.adminPhones = group.adminPhones.filter(p => p!== phoneToRemove);
    await group.save();
    res.json({ success: true, group });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
};

exports.makeAdmin = async (req, res) => {
  try {
    const { groupId, phone } = req.body;
    const myPhone = req.user.phoneNumber;
    const group = await KeduGroup.findOne({ groupId });
    if (!group) return res.status(404).json({ error: "Not found" });
    if (!group.adminPhones.includes(myPhone)) return res.status(403).json({ error: "Only admin" });
    if (!group.memberPhones.includes(phone)) return res.status(400).json({ error: "Not a member" });
    if (!group.adminPhones.includes(phone)) {
      group.adminPhones.push(phone);
      await group.save();
    }
    res.json({ success: true, group });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
};

exports.updateGroupPhoto = async (req, res) => {
  try {
    const { groupId, groupPhoto } = req.body;
    const group = await KeduGroup.findOne({ groupId });
    if (!group) return res.status(404).json({ error: "Not found" });
    group.groupPhoto = groupPhoto;
    await group.save();
    res.json({ success: true, group });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
}; // <-- THIS WAS MISSING!

exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.body;
    const myPhone = req.user.phoneNumber;
    const group = await KeduGroup.findOne({ groupId });
    if (!group) return res.status(404).json({ error: "Group not found" });
    group.memberPhones = group.memberPhones.filter(p => p!== myPhone);
    if(group.members) group.members = group.members.filter(p => p!== myPhone);
    group.adminPhones = group.adminPhones.filter(p => p!== myPhone);
    if (group.memberPhones.length === 0) {
      await KeduGroup.deleteOne({ groupId });
      return res.json({ success: true, deleted: true, message: "Group deleted, no members left" });
    }
    if (group.createdBy === myPhone) {
      group.createdBy = group.memberPhones[0];
      if (!group.adminPhones.includes(group.createdBy)) {
        group.adminPhones.push(group.createdBy);
      }
    }
    await group.save();
    res.json({ success: true, group, left: true });
  } catch (err) {
    console.error("leaveGroup error", err);
    res.status(500).json({ error: "Failed to leave group" });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.body;
    const myPhone = req.user.phoneNumber;
    const group = await KeduGroup.findOne({ groupId });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.createdBy!== myPhone &&!group.adminPhones.includes(myPhone)) {
      return res.status(403).json({ error: "Only admin can delete group" });
    }
    await KeduGroup.deleteOne({ groupId });
    res.json({ success: true, message: "Group deleted permanently" });
  } catch (err) {
    console.error("deleteGroup error", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
};
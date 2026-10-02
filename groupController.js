const { KeduGroup } = require('./models');

function genGroupId() {
  return 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2,6);
}

exports.createGroup = async (req, res) => {
  try {
    const { groupName, memberPhones, groupPhoto, description } = req.body;
    const myPhone = req.user.phoneNumber;

    if (!groupName ||!memberPhones || memberPhones.length < 2) {
      return res.status(400).json({ error: "Group name and at least 2 members required" });
    }

    // Ensure creator is included
    let allMembers = [...new Set([myPhone,...memberPhones])];

    const groupId = genGroupId();
    const roomId = groupId; // we use same as roomId for socket

    const group = await KeduGroup.create({
      groupId,
      roomId,
      groupName: groupName.trim(),
      groupPhoto: groupPhoto || "",
      description: description || "",
      adminPhones: [myPhone],
      memberPhones: allMembers,
      createdBy: myPhone
    });

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
    res.json({ groups });
  } catch (err) {
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
};
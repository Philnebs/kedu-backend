require('dns').setServers(['8.8.8.8','1.1.1.1']);
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const giftController = require('./giftController');
const rewardController = require('./rewardController');
const authController = require('./authController');
const payoutController = require('./payoutController');
const { User, Message, KeduSpot } = require('./models');
const groupController = require('./groupController');

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000
});

mongoose.connect(process.env.MONGO_URI)
 .then(() => console.log('🟢 Kedu Engine: Connected to MongoDB Atlas'))
 .catch((err) => console.error('🔴 Connection Error:', err));

app.get('/', (req, res) => {
  res.json({ status: "online", application: "Kedu Chat-to-Earn Engine API", version: "2.1" });
});

app.post('/api/auth/login', authController.loginOrRegister);
app.post('/api/rewards/exit-chat', authController.authenticateToken, rewardController.processChatExit);
app.post('/api/payouts/verify-bank', authController.authenticateToken, payoutController.verifyBankAccount);
app.post('/api/payouts/withdraw', authController.authenticateToken, payoutController.requestWithdrawal);

app.get('/api/gifts', giftController.getGifts);
app.post('/api/gifts/buy', giftController.buyGift);
app.post('/api/gifts/webhook', giftController.flwWebhook);
app.post('/api/gifts/send', giftController.sendGift);
app.get('/api/gifts/stats/:userId', giftController.myGiftStats);

// ====== GROUP ROUTES ======
app.post('/api/groups/create', authController.authenticateToken, groupController.createGroup);
app.get('/api/groups/my-groups', authController.authenticateToken, groupController.myGroups);
app.post('/api/groups/add-members', authController.authenticateToken, groupController.addMembers);
app.post('/api/groups/remove-member', authController.authenticateToken, groupController.removeMember);
app.post('/api/groups/make-admin', authController.authenticateToken, groupController.makeAdmin);
app.post('/api/groups/update-photo', authController.authenticateToken, groupController.updateGroupPhoto);

app.post('/api/contacts/sync', authController.authenticateToken, async (req, res) => {
  try {
    const { contacts } = req.body;
    const myPhone = req.user.phoneNumber;
    if (!contacts ||!Array.isArray(contacts)) return res.status(400).json({ error: "Contacts array required" });
    const normalized = contacts.map(p => {
      let phone = p.toString().replace(/\s+|-/g, '').trim();
      if (phone.startsWith('+234')) phone = '0' + phone.substring(4);
      else if (phone.startsWith('234')) phone = '0' + phone.substring(3);
      return phone;
    }).filter(p => p.length >= 10 && p!== myPhone);
    const keduUsers = await User.find({ phoneNumber: { $in: normalized } }, { legalFullName: 1, phoneNumber: 1, stateOfResidence: 1, wallet: 1 }).limit(100);
    console.log(`📱 Sync: ${myPhone} found ${keduUsers.length} Kedu users`);
    res.json({ keduUsers, count: keduUsers.length });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Failed to sync contacts" });
  }
});

app.post('/api/wallet/balance', authController.authenticateToken, async (req, res) => {
  try {
    const phone = req.body.phoneNumber || req.user.phoneNumber;
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: { legalFullName: user.legalFullName, phoneNumber: user.phoneNumber, wallet: { coinBalance: user.wallet?.coinBalance || 0 }, giftEarningsUSD: user.giftEarningsUSD || 0, _id: user._id },
      coins: user.wallet?.coinBalance || 0,
      giftUSD: user.giftEarningsUSD || 0
    });
  } catch (err) { res.status(500).json({ error: "Failed to get balance" }); }
});

app.post('/api/wallet/add', async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    const coinsToAdd = parseInt(amount) || 10;
    const user = await User.findOneAndUpdate({ phoneNumber: phoneNumber }, { $inc: { 'wallet.coinBalance': coinsToAdd } }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, newBalance: user.wallet.coinBalance, added: coinsToAdd });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function toNaijaAddress(googleResult) {
  const comp = googleResult.address_components || [];
  let street = "", area = "", landmark = "";
  for (let c of comp) {
    if (c.types.includes("route")) street = c.long_name;
    if (c.types.includes("sublocality") || c.types.includes("neighborhood")) area = c.long_name;
    if (c.types.includes("point_of_interest") || c.types.includes("establishment")) landmark = c.long_name;
  }
  if (!area) {
    const parts = (googleResult.formatted_address || "").split(",");
    area = parts.length > 1? parts[parts.length-3]?.trim() : "";
  }
  const landmarkStr = landmark? `Near ${landmark}` : (street? `Near ${street}` : "Around");
  const areaStr = area? `${area}` : "";
  return { address_raw: googleResult.formatted_address || "", address_naija: areaStr? `${landmarkStr}, ${areaStr}` : landmarkStr, landmark: landmark || street, area: area };
}

app.post('/api/location/reverse', authController.authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude ||!longitude) return res.status(400).json({ error: "lat/lng required" });

    // Try Google first if key exists
    try {
      const googleKey = process.env.GOOGLE_MAPS_KEY;
      if (googleKey) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleKey}`;
        const r = await fetch(url);
        const j = await r.json();
        if (j.results?.[0]) {
          const naija = toNaijaAddress(j.results[0]);
          return res.json({ latitude, longitude,...naija });
        }
      }
    } catch(e){}

    // FREE fallback OSM - no key needed
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
      const osmRes = await fetch(osmUrl, { headers: { 'User-Agent': 'KeduApp/2.1' } });
      const osm = await osmRes.json();
      const addr = osm.address || {};
      const road = addr.road || addr.pedestrian || addr.suburb || "";
      const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.city || addr.town || "";
      const state = addr.state || "";
      const landmark = addr.amenity || addr.shop || addr.building || road || "Current Location";
      const naijaStr = area? `Near ${road || landmark}, ${area}` : `Near ${landmark}, ${state}`;
      return res.json({ latitude, longitude, address_raw: osm.display_name || `${latitude}, ${longitude}`, address_naija: naijaStr, landmark: landmark, area: area || state });
    } catch(e) {
      return res.json({ latitude, longitude, address_raw: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, address_naija: `Around ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, landmark: "Current Location", area: "My Area" });
    }
  } catch (err) { res.status(500).json({ error: "reverse failed" }); }
});

app.post('/api/spots', authController.authenticateToken, async (req, res) => {
  const spot = await KeduSpot.create({ userPhone: req.user.phoneNumber,...req.body });
  res.json({ spot });
});
app.get('/api/spots', authController.authenticateToken, async (req, res) => {
  const spots = await KeduSpot.find({ userPhone: req.user.phoneNumber }).sort({ createdAt: -1 });
  res.json({ spots });
});

app.get('/api/messages/:roomId', authController.authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 }).limit(200);
    res.json({ messages });
  } catch (err) { res.status(500).json({ error: "Failed to fetch messages" }); }
});

app.get('/api/debug/users', async (req, res) => {
  const users = await User.find({}, { phoneNumber: 1, legalFullName: 1 }).limit(20);
  res.json(users);
});

io.on('connection', (socket) => {
  console.log(`⚡ User connected: ${socket.id}`);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`📥 ${socket.id} joined ${roomId}`);
    socket.to(roomId).emit('user_joined', { roomId, socketId: socket.id });
  });

  socket.on('send_message', async (data) => {
    try {
      if (!data.roomId ||!data.text ||!data.senderPhone) return;
      const msg = await Message.create({
        roomId: data.roomId,
        senderPhone: data.senderPhone,
        text: data.text,
        type: data.type || 'text',
        locationData: data.locationData || null,
        replyTo: data.replyTo,
        replyToSender: data.replyToSender,
        timestamp: new Date()
      });
      io.to(data.roomId).emit('receive_message', {
        roomId: data.roomId,
        senderPhone: data.senderPhone,
        text: data.text,
        type: data.type || 'text',
        locationData: data.locationData || null,
        timestamp: new Date().toISOString(),
        _id: msg._id,
        replyTo: data.replyTo,
        replyToSender: data.replyToSender,
      });
      console.log(`💬 ${data.senderPhone} -> ${data.roomId}: ${data.text.substring(0,30)}`);
    } catch (err) { console.error("Message save error:", err.message); }
  });

  // === KEDU LIVE+ : TASK 1.4 ===
  socket.on('request_location', (data) => {
    const { roomId, requesterPhone, requesterName } = data;
    console.log(`📍 ${requesterPhone} requesting location in ${roomId}`);
    socket.to(roomId).emit('location_request_received', { roomId, requesterPhone, requesterName, timestamp: new Date().toISOString() });
  });

  socket.on('approve_location', (data) => {
    const { roomId, approverPhone, type } = data;
    console.log(`📍 ${approverPhone} ${type} in ${roomId}`);
    socket.to(roomId).emit('location_request_approved', { roomId, approverPhone, type, timestamp: new Date().toISOString() });
    io.to(roomId).emit('location_approval_result', { roomId, approverPhone, type });
  });

  socket.on('send_live_location', (data) => {
    io.to(data.roomId).emit('receive_live_location', data);
  });

  socket.on('stop_live_location', (data) => {
    io.to(data.roomId).emit('live_location_stopped', data);
  });

  socket.on('delete_message', (data) => {
    socket.to(data.roomId).emit('message_deleted', { messageId: data.messageId, roomId: data.roomId, deleteType: data.type, senderPhone: data.senderPhone });
  });

  socket.on('typing', (data) => {
    socket.to(data.roomId).emit('user_typing', { roomId: data.roomId, senderPhone: data.senderPhone });
  });

  socket.on('disconnect', () => { console.log(`❌ Disconnected: ${socket.id}`); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kedu Server v2.1 + Live+ Task 1.4 running on port ${PORT}`);
});
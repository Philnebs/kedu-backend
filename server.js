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

// GIFT ROUTES
app.get('/api/gifts', giftController.getGifts);
app.post('/api/gifts/buy', giftController.buyGift);
app.post('/api/gifts/webhook', giftController.flwWebhook);
app.post('/api/gifts/send', giftController.sendGift);
app.get('/api/gifts/stats/:userId', giftController.myGiftStats);

// ====== FIXED CONTACTS SYNC - THIS ENABLES YOU TO CHAT WITH ANOTHER USER ======
app.post('/api/contacts/sync', authController.authenticateToken, async (req, res) => {
  try {
    const { contacts } = req.body;
    const myPhone = req.user.phoneNumber;
    if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: "Contacts array required" });

    const normalized = contacts.map(p => {
      let phone = p.toString().replace(/\s+|-/g, '').trim();
      if (phone.startsWith('+234')) phone = '0' + phone.substring(4);
      else if (phone.startsWith('234')) phone = '0' + phone.substring(3);
      return phone;
    }).filter(p => p.length >= 10 && p !== myPhone);

    // Find all users whose phone is in the list
    const keduUsers = await User.find(
      { phoneNumber: { $in: normalized } },
      { legalFullName: 1, phoneNumber: 1, stateOfResidence: 1, wallet: 1 }
    ).limit(100);

    console.log(`📱 Sync: ${myPhone} found ${keduUsers.length} Kedu users`);
    res.json({ keduUsers, count: keduUsers.length });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Failed to sync contacts" });
  }
});

// ====== NEW: WALLET BALANCE - FIXES EMPTY PROFILE ======
app.post('/api/wallet/balance', authController.authenticateToken, async (req, res) => {
  try {
    const phone = req.body.phoneNumber || req.user.phoneNumber;
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({ 
      user: {
        legalFullName: user.legalFullName,
        phoneNumber: user.phoneNumber,
        wallet: { coinBalance: user.wallet?.coinBalance || 0 },
        giftEarningsUSD: user.giftEarningsUSD || 0,
        _id: user._id
      },
      coins: user.wallet?.coinBalance || 0,
      giftUSD: user.giftEarningsUSD || 0
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get balance" });
  }
});

app.post('/api/wallet/add', async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    const coinsToAdd = parseInt(amount) || 10;

    const user = await User.findOneAndUpdate(
      { phoneNumber: phoneNumber },
      { $inc: { 'wallet.coinBalance': coinsToAdd } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ 
      success: true, 
      newBalance: user.wallet.coinBalance,
      added: coinsToAdd 
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ====== KEDU LIVE+ : NAIJA ADDRESS FORMATTER ======


function toNaijaAddress(googleResult) {
  // Takes Google/Mapbox raw and turns to Naija style
  const comp = googleResult.address_components || [];
  let street = "", area = "", landmark = "";

  // Extract
  for (let c of comp) {
    if (c.types.includes("route")) street = c.long_name;
    if (c.types.includes("sublocality") || c.types.includes("neighborhood")) area = c.long_name;
    if (c.types.includes("point_of_interest") || c.types.includes("establishment")) landmark = c.long_name;
  }

  // Fallback from formatted_address
  if (!area) {
    const parts = (googleResult.formatted_address || "").split(",");
    area = parts.length > 1? parts[parts.length-3]?.trim() : "";
  }

  // Build Naija style
  const landmarkStr = landmark? `Near ${landmark}` : (street? `Near ${street}` : "Around");
  const areaStr = area? `${area}` : "";

  return {
    address_raw: googleResult.formatted_address || "",
    address_naija: areaStr? `${landmarkStr}, ${areaStr}` : landmarkStr,
    landmark: landmark || street,
    area: area
  };
}

app.post('/api/location/reverse', authController.authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude ||!longitude) return res.status(400).json({ error: "lat/lng required" });

    // Call Google Geocoding (you need GOOGLE_MAPS_KEY in Render env)
    const googleKey = process.env.GOOGLE_MAPS_KEY;
    let googleData = null;

    if (googleKey) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleKey}`;
      const r = await fetch(url);
      const j = await r.json();
      googleData = j.results?.[0];
    }

    if (!googleData) {
      // Fallback if no API key yet - still works
      return res.json({
        latitude, longitude,
        address_raw: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        address_naija: `Around ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        landmark: "Current Location",
        area: "My Area"
      });
    }

    const naija = toNaijaAddress(googleData);
    res.json({ latitude, longitude,...naija });

  } catch (err) {
    console.error("reverse error", err);
    res.status(500).json({ error: "reverse failed" });
  }
});

// Spots: save and get
app.post('/api/spots', authController.authenticateToken, async (req, res) => {
  const spot = await KeduSpot.create({ userPhone: req.user.phoneNumber,...req.body });
  res.json({ spot });
});
app.get('/api/spots', authController.authenticateToken, async (req, res) => {
  const spots = await KeduSpot.find({ userPhone: req.user.phoneNumber }).sort({ createdAt: -1 });
  res.json({ spots });
});

// ====== LOAD CHAT HISTORY ======
app.get('/api/messages/:roomId', authController.authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 }).limit(200);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ====== DEBUG: LIST ALL USERS (remove in production) ======
app.get('/api/debug/users', async (req, res) => {
  const users = await User.find({}, { phoneNumber: 1, legalFullName: 1 }).limit(20);
  res.json(users);
});

// ====== SOCKET.IO REAL-TIME CHAT ======
io.on('connection', (socket) => {
  console.log(`⚡ User connected: ${socket.id}`);
  
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`📥 ${socket.id} joined ${roomId}`);
    socket.to(roomId).emit('user_joined', { roomId, socketId: socket.id });
  });
  
  socket.on('send_message', async (data) => {
    try {
      if (!data.roomId || !data.text || !data.senderPhone) return;
      
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
    } catch (err) {
      console.error("Message save error:", err.message);
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.roomId).emit('user_typing', { roomId: data.roomId, senderPhone: data.senderPhone });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kedu Server v2.1 running with Chat + Wallet on port ${PORT}`);
});
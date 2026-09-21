require('dns').setServers(['8.8.8.8','1.1.1.1']);
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const giftController = require('./giftController');

const rewardController = require('./rewardController');
const authController = require('./authController'); 
const payoutController = require('./payoutController');
const { User, Message } = require('./models');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingTimeout: 60000 });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Kedu Engine: Connected to MongoDB Atlas Cloud Database.'))
  .catch((err) => console.error('🔴 Kedu Engine Connection Error:', err));

app.get('/', (req, res) => {
  res.json({ status: "online", application: "Kedu Chat-to-Earn Engine API" });
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

// NEW: Real contacts discovery - fixes empty chat list on 2 phones
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
    }).filter(p => p.length === 11 && p !== myPhone);

    const keduUsers = await User.find(
      { phoneNumber: { $in: normalized } },
      { legalFullName: 1, phoneNumber: 1, stateOfResidence: 1 }
    ).limit(100);

    res.json({ keduUsers });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync contacts" });
  }
});

// NEW: Load history when opening chat
app.get('/api/messages/:roomId', authController.authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 }).limit(100);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

io.on('connection', (socket) => {
  socket.on('join_room', (roomId) => socket.join(roomId));
  
  socket.on('send_message', async (data) => {
    try {
      if (!data.roomId || !data.text) return;
      await Message.create({
        roomId: data.roomId,
        senderPhone: data.senderPhone,
        text: data.text,
        timestamp: new Date()
      });
      io.to(data.roomId).emit('receive_message', {
        roomId: data.roomId,
        senderPhone: data.senderPhone,
        text: data.text,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Message save error:", err.message);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kedu Server running actively with WebSockets on port ${PORT}`);
});
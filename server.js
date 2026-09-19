require('dns').setServers(['8.8.8.8','1.1.1.1']);
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const http = require('http');
const { Server } = require('socket.io');

// Import Controllers
const rewardController = require('./rewardController');
const authController = require('./authController'); 
const payoutController = require('./payoutController'); // 👈 NEW PAYOUT IMPORT

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Kedu Engine: Connected to MongoDB Atlas Cloud Database.'))
  .catch((err) => console.error('🔴 Kedu Engine Connection Error:', err));

app.get('/', (req, res) => {
  res.json({ status: "online", application: "Kedu Chat-to-Earn Engine API" });
});

// Auth Routes
app.post('/api/auth/login', authController.loginOrRegister);

// Secure Rewards Route
app.post('/api/rewards/exit-chat', authController.authenticateToken, rewardController.processChatExit);

// 👉 NEW SECURE PAYOUT PIPELINES (Protected by token middleware security)
app.post('/api/payouts/verify-bank', authController.authenticateToken, payoutController.verifyBankAccount);
app.post('/api/payouts/withdraw', authController.authenticateToken, payoutController.requestWithdrawal);

// WebSockets
io.on('connection', (socket) => {
  socket.on('join_room', (roomId) => socket.join(roomId));
  socket.on('send_message', (data) => io.to(data.roomId).emit('receive_message', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Kedu Server running actively with WebSockets on port ${PORT}`);
});

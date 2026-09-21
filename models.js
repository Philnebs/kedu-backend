const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true, index: true },
  legalFullName: { type: String, required: true },
  stateOfResidence: { type: String, required: true },
  verifiedName: { type: String, default: "" }, 
  wallet: {
    coinBalance: { type: Number, default: 0, min: 0 },
    dailyAccumulatedCoins: { type: Number, default: 0, max: 600 },
    lastResetAt: { type: Date, default: Date.now }
  },
  bankDetails: {
    bankName: { type: String, default: "" },
    bankCode: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    isLinked: { type: Boolean, default: false }
  },
  createdAt: { type: Date, default: Date.now }
});

const ChatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  roomId: { type: String, required: true, index: true },
  enteredAt: { type: Date, required: true },
  exitedAt: { type: Date, required: true },
  durationSeconds: { type: Number, default: 0 },
  coinsAwarded: { type: Number, default: 0 },
  flags: [{ type: String }] 
});

const MessageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  senderPhone: { type: String, required: true, index: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
MessageSchema.index({ roomId: 1, timestamp: 1 });

module.exports = {
  User: mongoose.model('User', UserSchema),
  ChatSession: mongoose.model('ChatSession', ChatSessionSchema),
  Message: mongoose.model('Message', MessageSchema)
};
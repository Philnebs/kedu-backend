const mongoose = require('mongoose');

// 1. User & Wallet Layout (Updated for Legal Registration Compliance)
const UserSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  legalFullName: { type: String, required: true }, // 👈 Added for CBN bank verification matching
  stateOfResidence: { type: String, required: true }, // 👈 Added for localized AdMob targeting analytics
  verifiedName: { type: String, default: "" }, 
  wallet: {
    coinBalance: { type: Number, default: 0, min: 0 }, // Starts fresh at 0
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
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roomId: { type: String, required: true },
  enteredAt: { type: Date, required: true },
  exitedAt: { type: Date, required: true },
  durationSeconds: { type: Number, default: 0 },
  coinsAwarded: { type: Number, default: 0 },
  flags: [{ type: String }] 
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  ChatSession: mongoose.model('ChatSession', ChatSessionSchema)
};

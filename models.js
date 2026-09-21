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
  // === KEDU GIFTS - STEP 1 ===
  giftInventory: {
    pebble: { type: Number, default: 0, min: 0 },
    rose: { type: Number, default: 0, min: 0 },
    heart: { type: Number, default: 0, min: 0 },
    crown: { type: Number, default: 0, min: 0 },
    car: { type: Number, default: 0, min: 0 },
    diamond: { type: Number, default: 0, min: 0 },
    lion: { type: Number, default: 0, min: 0 },
    mansion: { type: Number, default: 0, min: 0 },
    moneyRain: { type: Number, default: 0, min: 0 },
    universe: { type: Number, default: 0, min: 0 }
  },
  giftEarningsUSD: { type: Number, default: 0, min: 0 }, // 70% earnings, withdraw in Naira
  giftEarningsNGNCache: { type: Number, default: 0 }, // cached for display
  lastGiftWithdrawAt: { type: Date }, // for daily limit
  // === END GIFTS ===
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

// === KEDU GIFTS CATALOG ===
const giftCatalogSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true }, // pebble, rose...
  name: { type: String, required: true },
  priceUSD: { type: Number, required: true },
  priceNGN: { type: Number, required: true }, // locked display price
  receiverUSD: { type: Number, required: true }, // 70%
  platformUSD: { type: Number, required: true }, // 30%
  tier: { type: String, enum: ["micro", "sweet", "flex", "legendary", "whale", "god"], required: true },
  animation: { type: String, enum: ["small", "banner", "fullscreen", "rain", "appwide"], required: true },
  isActive: { type: Boolean, default: true }
});
const GiftCatalog = mongoose.model('GiftCatalog', giftCatalogSchema);

// === GIFT TRANSACTIONS - FOR AUDIT & ANTI-EXPLOIT ===
const giftTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ["purchase", "targeted", "rain"], required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  groupId: { type: String }, // roomId if group gift
  giftKey: { type: String, required: true },
  giftName: { type: String, required: true },
  amountPaidNGN: { type: Number },
  amountPaidUSD: { type: Number },
  rateAtPurchase: { type: Number },
  platformFeeUSD: { type: Number },
  receiverEarnUSD: { type: Number },
  rainRecipients: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amountUSD: Number
  }],
  status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  flwRef: { type: String, index: true }
}, { timestamps: true });
const GiftTransaction = mongoose.model('GiftTransaction', giftTransactionSchema);

module.exports = {
  User: mongoose.model('User', UserSchema),
  ChatSession: mongoose.model('ChatSession', ChatSessionSchema),
  Message: mongoose.model('Message', MessageSchema),
  GiftCatalog,
  GiftTransaction
};
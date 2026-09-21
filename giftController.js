const { User, GiftCatalog, GiftTransaction } = require('./models');
const axios = require('axios');
const crypto = require('crypto');

// RATE $1 = ₦1327 - locked
const RATE = 1327;

// 1. GET ALL GIFTS - for frontend shop
exports.getGifts = async (req, res) => {
  const gifts = await GiftCatalog.find({ isActive: true }).sort({ priceUSD: 1 });
  res.json(gifts);
};

// 2. BUY GIFTS - create Flutterwave payment
exports.buyGift = async (req, res) => {
  const { userId, giftKey, quantity = 1 } = req.body;
  if (!userId ||!giftKey) return res.status(400).json({ error: "userId and giftKey required" });

  const gift = await GiftCatalog.findOne({ key: giftKey });
  if (!gift) return res.status(404).json({ error: "Gift not found" });

  const totalNGN = gift.priceNGN * quantity;
  const tx_ref = `kedu_gift_${userId}_${giftKey}_${Date.now()}`;

  // Save pending transaction
  await GiftTransaction.create({
    type: "purchase",
    buyerId: userId,
    giftKey: gift.key,
    giftName: gift.name,
    amountPaidNGN: totalNGN,
    amountPaidUSD: gift.priceUSD * quantity,
    rateAtPurchase: RATE,
    flwRef: tx_ref,
    status: "pending"
  });

  // Flutterwave init
  try {
    const flwRes = await axios.post('https://api.flutterwave.com/v3/payments', {
      tx_ref,
      amount: totalNGN,
      currency: "NGN",
      redirect_url: process.env.FLW_REDIRECT_URL || "https://kedu.com/success",
      customer: { email: `${userId}@kedu.com`, phonenumber: req.body.phone || "000", name: giftKey },
      customizations: { title: `Buy ${quantity}x ${gift.name}`, description: `Kedu Gift Purchase` }
    }, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });

    return res.json({ link: flwRes.data.data.link, tx_ref, totalNGN });
  } catch (e) {
    console.error("FLW error", e.response?.data || e.message);
    return res.status(500).json({ error: "Payment init failed" });
  }
};

// 3. FLUTTERWAVE WEBHOOK - CREDIT INVENTORY ONLY HERE (anti fake payment)
exports.flwWebhook = async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers["verif-hash"];
  if (secretHash && signature!== secretHash) return res.status(401).send("Invalid hash");

  const payload = req.body;
  const tx_ref = payload.txRef || payload.tx_ref;
  const status = payload.status;

  if (status!== "successful") return res.json({ ok: true });

  const trx = await GiftTransaction.findOne({ flwRef: tx_ref, status: "pending" });
  if (!trx) return res.json({ ok: true }); // already processed

  // Verify with Flutterwave
  try {
    const verify = await axios.get(`https://api.flutterwave.com/v3/transactions/${payload.id}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    if (verify.data.data.status!== "successful") return res.json({ ok: true });
  } catch (e) {
    return res.status(500).send("verify failed");
  }

  // CREDIT USER
  const gift = await GiftCatalog.findOne({ key: trx.giftKey });
  const qty = Math.round(trx.amountPaidNGN / gift.priceNGN);

  await User.findByIdAndUpdate(trx.buyerId, { $inc: { [`giftInventory.${trx.giftKey}`]: qty } });
  trx.status = "success";
  await trx.save();

  console.log(`✅ Credited ${qty}x ${trx.giftKey} to ${trx.buyerId}`);
  res.json({ ok: true });
};

// 4. SEND GIFT - targeted (1 to 1) or group
exports.sendGift = async (req, res) => {
  const { senderId, receiverId, roomId, giftKey, quantity = 1 } = req.body;

  if (!senderId ||!giftKey || (!receiverId &&!roomId)) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const sender = await User.findById(senderId);
  if (!sender || (sender.giftInventory[giftKey] || 0) < quantity) {
    return res.status(400).json({ error: "Insufficient gift balance" });
  }

  const gift = await GiftCatalog.findOne({ key: giftKey });
  if (!gift) return res.status(404).json({ error: "Gift not found" });

  // Special: Money Rain
  if (giftKey === "moneyRain") {
    return exports.sendMoneyRain(req, res);
  }

  // Deduct
  sender.giftInventory[giftKey] -= quantity;
  await sender.save();

  // Credit receiver earnings (70%)
  const totalReceiverUSD = gift.receiverUSD * quantity;
  if (receiverId) {
    await User.findByIdAndUpdate(receiverId, { $inc: { giftEarningsUSD: totalReceiverUSD } });
  }

  await GiftTransaction.create({
    type: "targeted",
    senderId,
    receiverId: receiverId || null,
    groupId: roomId || null,
    giftKey,
    giftName: gift.name,
    receiverEarnUSD: totalReceiverUSD,
    platformFeeUSD: gift.platformUSD * quantity,
    status: "success"
  });

  // For socket.io - frontend will listen
  res.json({
    success: true,
    message: `Sent ${quantity}x ${gift.name}`,
    animation: gift.animation,
    tier: gift.tier
  });
};

// 5. MONEY RAIN - 75$ gift splits to room
exports.sendMoneyRain = async (req, res) => {
  const { senderId, roomId, giftKey } = req.body;
  const sender = await User.findById(senderId);
  if (!sender || (sender.giftInventory[giftKey] || 0) < 1) {
    return res.status(400).json({ error: "No Money Rain gift" });
  }

  // Get 10-20 recent active users in room (you will replace with your online users logic)
  // For now, mock: get last 15 users who sent message in room
  const { Message } = require('./models');
  const recentSenders = await Message.aggregate([
    { $match: { roomId } },
    { $sort: { timestamp: -1 } },
    { $limit: 50 },
    { $group: { _id: "$senderPhone" } }
  ]);

  let recipientPhones = recentSenders.map(r => r._id).filter(p => p!== sender.phoneNumber).slice(0, 15);
  if (recipientPhones.length < 5) recipientPhones = recipientPhones.slice(0, 5);
  if (recipientPhones.length === 0) return res.status(400).json({ error: "No users in room to rain" });

  const recipients = await User.find({ phoneNumber: { $in: recipientPhones } });
  const perUserUSD = 52.5 / recipients.length; // 70% of $75

  sender.giftInventory[giftKey] -= 1;
  await sender.save();

  for (const u of recipients) {
    u.giftEarningsUSD += perUserUSD;
    await u.save();
  }

  await GiftTransaction.create({
    type: "rain",
    senderId,
    groupId: roomId,
    giftKey,
    giftName: "Money Rain",
    receiverEarnUSD: 52.5,
    platformFeeUSD: 22.5,
    rainRecipients: recipients.map(u => ({ userId: u._id, amountUSD: perUserUSD })),
    status: "success"
  });

  res.json({ success: true, recipients: recipients.length, perUserUSD, animation: "rain" });
};

// 6. MY INVENTORY + EARNINGS
exports.myGiftStats = async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const earningsNGN = Math.floor(user.giftEarningsUSD * RATE);

  res.json({
    inventory: user.giftInventory,
    earningsUSD: user.giftEarningsUSD,
    earningsNGN,
    rate: RATE
  });
};
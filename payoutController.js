const axios = require('axios');
const { User } = require('./models');

const FLW_BASE = "https://api.flutterwave.com/v3";

// 1. VERIFY ACCOUNT NUMBER VIA FLUTTERWAVE
exports.verifyBankAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode, bankName } = req.body;
    const userId = req.user.userId;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: "Missing account number or bank code selection." });
    }

    // Correct Flutterwave resolve endpoint
    const response = await axios.post(
      `${FLW_BASE}/accounts/resolve`,
      { 
        account_number: accountNumber, 
        account_bank: bankCode 
      },
      { 
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } 
      }
    );

    if (response.data.status === 'success') {
      const accountName = response.data.data.account_name;

      await User.findByIdAndUpdate(userId, {
        verifiedName: accountName,
        'bankDetails.accountNumber': accountNumber,
        'bankDetails.bankCode': bankCode,
        'bankDetails.bankName': bankName || bankCode,
        'bankDetails.isLinked': true
      });

      return res.status(200).json({
        message: "Bank account linked successfully.",
        verifiedName: accountName,
        account_name: accountName
      });
    } else {
      return res.status(400).json({ error: "Could not resolve bank account details." });
    }
  } catch (error) {
    console.error("Flutterwave lookup failure:", error.response?.data || error.message);
    return res.status(400).json({ 
      error: error.response?.data?.message || "Bank validation failed. Verify your inputs." 
    });
  }
};

// 2. TRIGGER ₦500 AUTOMATED CASH TRANSFER
exports.requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user || !user.bankDetails.isLinked) {
      return res.status(400).json({ error: "Please link a valid bank account first." });
    }

    if (user.wallet.coinBalance < 10000) {
      return res.status(400).json({ error: "Insufficient funds. Milestone is 10,000 coins (₦500)." });
    }

    // Prevent double-tap - atomic check
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, 'wallet.coinBalance': { $gte: 10000 } },
      { $inc: { 'wallet.coinBalance': -10000 } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ error: "Insufficient funds or withdrawal already in progress." });
    }

    const txReference = `kedu-payout-${Date.now()}-${userId}`;

    // Correct Flutterwave transfer endpoint
    const response = await axios.post(
      `${FLW_BASE}/transfers`,
      {
        account_bank: updatedUser.bankDetails.bankCode,
        account_number: updatedUser.bankDetails.accountNumber,
        amount: 500,
        narration: "Kedu Chat-to-Earn Cashout Payout",
        currency: "NGN",
        reference: txReference,
        callback_url: "https://kedu-backend.onrender.com/api/payouts/webhook",
        debit_currency: "NGN"
      },
      { 
        headers: { 
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (response.data.status === 'success') {
      return res.status(200).json({
        message: "Payout queued successfully! Your ₦500 is on its way.",
        transferDetails: response.data.data,
        newBalance: updatedUser.wallet.coinBalance
      });
    } else {
      // Refund if Flutterwave fails after deduction
      await User.findByIdAndUpdate(userId, { $inc: { 'wallet.coinBalance': 10000 } });
      return res.status(500).json({ error: "Flutterwave transfer queue failure." });
    }

  } catch (error) {
    console.error("Transfer fault:", error.response?.data || error.message);
    // Refund on exception
    try {
      await User.findByIdAndUpdate(req.user.userId, { $inc: { 'wallet.coinBalance': 10000 } });
    } catch(e) {}
    return res.status(500).json({ error: "Failed to dispatch bank payout transfer." });
  }
};
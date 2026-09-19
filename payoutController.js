const axios = require('axios');
const { User } = require('./models');

// 1. VERIFY ACCOUNT NUMBER VIA FLUTTERWAVE
exports.verifyBankAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    const userId = req.user.userId;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: "Missing account number or bank code selection." });
    }

    // Call Flutterwave's Account Verification Verification Route
    const response = await axios.post(
      'https://flutterwave.com',
      { account_number: accountNumber, account_bank: bankCode },
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
    );

    if (response.data.status === 'success') {
      const accountName = response.data.data.account_name;

      // Update user document inside your Atlas MongoDB collection
      await User.findByIdAndUpdate(userId, {
        verifiedName: accountName,
        'bankDetails.accountNumber': accountNumber,
        'bankDetails.bankCode': bankCode,
        'bankDetails.isLinked': true
      });

      return res.status(200).json({
        message: "Bank account linked successfully.",
        verifiedName: accountName
      });
    } else {
      return res.status(400).json({ error: "Could not resolve bank account details." });
    }
  } catch (error) {
    console.error("Flutterwave lookup failure:", error.response?.data || error.message);
    return res.status(400).json({ error: "Bank validation failed. Verify your inputs." });
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

    // Strict Rule Validation: Verify milestone baseline requirement
    if (user.wallet.coinBalance < 10000) {
      return res.status(400).json({ error: "Insufficient funds. Milestone is 10,000 coins (₦500)." });
    }

    // Generate unique internal deployment reference
    const txReference = `kedu-payout-${Date.now()}-${userId}`;

    // Execute server-to-server transaction request to Flutterwave API
    const response = await axios.post(
      'https://flutterwave.com',
      {
        account_bank: user.bankDetails.bankCode,
        account_number: user.bankDetails.accountNumber,
        amount: 500, // Fixed ₦500 Cash Payout
        narration: "Kedu Chat-to-Earn Cashout Payout",
        currency: "NGN",
        reference: txReference,
        callback_url: "https://onrender.com"
      },
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
    );

    if (response.data.status === 'success') {
      // Deduct the 10,000 coins from user wallet securely on the server
      user.wallet.coinBalance -= 10000;
      await user.save();

      return res.status(200).json({
        message: "Payout queued successfully! Your ₦500 is on its way.",
        transferDetails: response.data.data
      });
    } else {
      return res.status(500).json({ error: "Flutterwave transfer queue failure." });
    }

  } catch (error) {
    console.error("Transfer fault:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to dispatch bank payout transfer." });
  }
};

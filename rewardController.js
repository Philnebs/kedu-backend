const { User, ChatSession } = require('./models');

// 🚨 MAKE SURE THIS EXACT NAME IS EXPORTED HERE
exports.processChatExit = async (req, res) => {
  try {
    const { roomId, enteredAt, exitedAt } = req.body;
    const userId = req.user.userId; // Extracted safely from token middleware

    if (!roomId || !enteredAt || !exitedAt) {
      return res.status(400).json({ error: "Missing tracking metrics." });
    }

    const start = new Date(enteredAt);
    const end = new Date(exitedAt);
    const durationSeconds = Math.floor((end - start) / 1000);

    let coinsEarned = 0;
    let flags = [];

    if (durationSeconds < 60) {
      flags.push('SPAM_ATTEMPT');
    } else {
      coinsEarned = 10;
      if (durationSeconds > 1800) flags.push('MAX_DURATION_EXCEEDED');
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    // Reset daily counters if it's a new calendar day
    const now = new Date();
    if (new Date(user.wallet.lastResetAt).toDateString() !== now.toDateString()) {
      user.wallet.dailyAccumulatedCoins = 0;
      user.wallet.lastResetAt = now;
    }

    const remainingLimit = 600 - user.wallet.dailyAccumulatedCoins;
    if (remainingLimit <= 0 && coinsEarned > 0) {
      flags.push('DAILY_CAP_REACHED');
      coinsEarned = 0;
    } else if (coinsEarned > remainingLimit) {
      flags.push('PARTIAL_DAILY_CAP_APPLIED');
      coinsEarned = remainingLimit;
    }

    user.wallet.coinBalance += coinsEarned;
    user.wallet.dailyAccumulatedCoins += coinsEarned;
    await user.save();

    const session = new ChatSession({
      userId, roomId, enteredAt: start, exitedAt: end, durationSeconds, coinsAwarded: coinsEarned, flags
    });
    await session.save();

    return res.status(200).json({
      message: "Audited successfully.",
      coinsAwarded: coinsEarned,
      totalBalance: user.wallet.coinBalance,
      dailyProgress: user.wallet.dailyAccumulatedCoins,
      flags
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server processing error." });
  }
};

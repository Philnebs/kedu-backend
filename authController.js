const { User } = require('./models');
const jwt = require('jsonwebtoken');

exports.loginOrRegister = async (req, res) => {
  try {
    const { phoneNumber, legalFullName, stateOfResidence } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required to continue." });
    }

    const cleanPhone = phoneNumber.trim();

    // Look for an existing user account profile
    let user = await User.findOne({ phoneNumber: cleanPhone });
    let isNewUser = false;

    if (!user) {
      // If user doesn't exist, registration constraints are strictly required
      if (!legalFullName || !stateOfResidence) {
        return res.status(400).json({ 
          error: "Registration required. Please provide your legal full name and state of residence." 
        });
      }

      isNewUser = true;
      user = new User({
        phoneNumber: cleanPhone,
        legalFullName: legalFullName.trim(),
        stateOfResidence: stateOfResidence.trim(),
        wallet: {
          coinBalance: 0, // Enforce fresh starting balance
          dailyAccumulatedCoins: 0,
          lastResetAt: new Date()
        }
      });
      await user.save();
    }

    // Sign a secure session token
    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber },
      process.env.JWT_SECRET || 'kedu_fallback_secret_key',
      { expiresIn: '90d' }
    );

    return res.status(200).json({
      message: isNewUser ? "Kedu account registered successfully." : "Welcome back to Kedu.",
      token,
      user
    });

  } catch (error) {
    console.error("Auth controller failure:", error);
    return res.status(500).json({ error: "Internal authentication system error." });
  }
};

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, process.env.JWT_SECRET || 'kedu_fallback_secret_key', (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid or expired session token." });
    req.user = decoded;
    next();
  });
};

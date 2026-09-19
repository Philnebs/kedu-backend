const { User } = require('./models');
const jwt = require('jsonwebtoken');

exports.loginOrRegister = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required." });

    const cleanPhone = phoneNumber.trim();
    let user = await User.findOne({ phoneNumber: cleanPhone });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({ phoneNumber: cleanPhone });
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber },
      process.env.JWT_SECRET || 'kedu_fallback_secret_key',
      { expiresIn: '90d' }
    );

    return res.status(200).json({ token, user });
  } catch (error) {
    return res.status(500).json({ error: "Auth engine error." });
  }
};

// 🚨 MAKE SURE THIS EXACT NAME IS EXPORTED DOWN HERE
exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Token missing." });

  jwt.verify(token, process.env.JWT_SECRET || 'kedu_fallback_secret_key', (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    req.user = decoded;
    next();
  });
};

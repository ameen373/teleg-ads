require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const { User, Link, Ad, Transaction } = require('./models');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

function validateTelegramWebAppData(telegramInitData) {
  if (!telegramInitData) return false;
  const urlParams = new URLSearchParams(telegramInitData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  const paramsData = [];
  for (const [key, value] of urlParams.entries()) {
    paramsData.push(`${key}=${value}`);
  }
  paramsData.sort();

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN || '')
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(paramsData.join('\n'))
    .digest('hex');

  return calculatedHash === hash;
}

function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData || !validateTelegramWebAppData(initData)) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }
  const urlParams = new URLSearchParams(initData);
  const userJson = urlParams.get('user');
  if (!userJson) {
    return res.status(400).json({ error: 'User data missing' });
  }
  req.telegramUser = JSON.parse(userJson);
  next();
}

app.post('/api/auth', authMiddleware, async (req, res) => {
  try {
    const tgUser = req.telegramUser;
    let user = await User.findOne({ telegramId: tgUser.id.toString() });
    if (!user) {
      user = await User.create({
        telegramId: tgUser.id.toString(),
        username: tgUser.username || '',
        firstName: tgUser.first_name || '',
        lastName: tgUser.last_name || '',
        languageCode: tgUser.language_code || 'en'
      });
    } else {
      user.username = tgUser.username || user.username;
      user.firstName = tgUser.first_name || user.firstName;
      user.lastName = tgUser.last_name || user.lastName;
      await user.save();
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.telegramUser.id.toString() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

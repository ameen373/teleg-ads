const { User } = require('../models');

async function findOrCreateUser(tgId, updateData = {}, setOnInsertData = {}) {
  if (!tgId) return null;
  const cleanId = String(tgId).trim();
  if (!cleanId || cleanId === 'null' || cleanId === 'undefined' || cleanId === '' || cleanId === 'NaN') {
    return null;
  }
  try {
    return await User.findOneAndUpdate(
      { telegramId: cleanId },
      {
        $setOnInsert: { telegramId: cleanId, ...setOnInsertData },
        $set: updateData
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      return await User.findOne({ telegramId: cleanId });
    }
    throw err;
  }
}

module.exports = {
  findOrCreateUser
};

const mongoose = require('mongoose');
const { 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Announcement title is required'], 
    trim: true 
  },
  content: { 
    type: String, 
    required: [true, 'Announcement content is required'], 
    trim: true 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  },
  targetUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  targetTelegramId: { 
    type: String, 
    default: null, 
    trim: true, 
    index: true,
    set: sanitizeTelegramId 
  }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetUser: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId) {
  const targetTgId = sanitizeTelegramId(telegramId);
  const orConditions = [
    { targetUser: null, targetTelegramId: null }
  ];
  if (isObjectId(userId)) {
    orConditions.push({ targetUser: userId });
  }
  if (targetTgId) {
    orConditions.push({ targetTelegramId: targetTgId });
  }

  return this.find({
    isActive: true,
    $or: orConditions
  }).sort({ createdAt: -1 });
};

const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = Announcement;
module.exports.Announcement = Announcement;

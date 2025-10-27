const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('./User');
const Post = require('./Post');
const Comment = require('./Comment');

class Notification extends Model {}

Notification.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  recipient_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  sender_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  target_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  sub_target_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  target_type: {
    type: DataTypes.ENUM('Post', 'Comment', 'Tag', 'User', 'Follow', 'Share', 'React', 'Bible'),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('react', 'comment', 'follow', 'mention', 'share', 'tag', 'bible'),
    allowNull: false,
  },
  message: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  sequelize,
  modelName: 'Notification',
  tableName: 'notifications',
  timestamps: false,
  underscored: true,
});


Notification.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });
Notification.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

Notification.belongsTo(Post, { foreignKey: 'target_id', as: 'targetPost' });
Notification.belongsTo(Comment, { foreignKey: 'sub_target_id', as: 'targetComment' });

module.exports = Notification;

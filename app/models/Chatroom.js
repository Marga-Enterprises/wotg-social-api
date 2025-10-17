// app/models/Chatroom.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('./User'); // Import User model for relationship

class Chatroom extends Model {}

// 🔹 Define Chatroom schema
Chatroom.init(
  {
    id: {
      type: DataTypes.INTEGER(11),
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true, // Optional for private chats
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'group', // 'group' or 'private'
    },
    chatroom_photo: {
      type: DataTypes.STRING(255), // File name or full URL
      allowNull: true,
    },
    welcome_chat: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    target_user_id: {
      type: DataTypes.INTEGER(11),
      allowNull: true, // Used for linking a specific user (e.g. private/welcome chat)
    },
  },
  {
    sequelize,
    modelName: 'Chatroom',
    tableName: 'chatrooms',
    timestamps: true,
    underscored: true,
  }
);

// 🔗 Relationship: A Chatroom belongs to one target User
Chatroom.belongsTo(User, {
  foreignKey: 'target_user_id',
  as: 'TargetUser',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});

module.exports = Chatroom;

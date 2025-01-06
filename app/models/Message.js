const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('./User'); // Import User model
const Chatroom = require('./Chatroom'); // Import Chatroom model

class Message extends Model {}

Message.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false, // Messages must have content
    },
    senderId: {
        type: DataTypes.INTEGER(11),
        allowNull: false, // No foreign key constraint
    },
    chatroomId: {
        type: DataTypes.INTEGER(11),
        allowNull: false, // No foreign key constraint
    },
}, {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    timestamps: true, // Track when messages are sent
    underscored: true,
});

// Define relationships programmatically (no database constraints)
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Message.belongsTo(Chatroom, { foreignKey: 'chatroomId', as: 'chatroom' });
Chatroom.hasMany(Message, { foreignKey: 'chatroomId', as: 'messages' });

module.exports = Message;

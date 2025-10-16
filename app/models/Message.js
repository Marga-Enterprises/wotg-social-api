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
        allowNull: false,
    },
    chatroomId: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
    },
    /** 👇 Added target_user_id field **/
    targetUserId: {
        type: DataTypes.INTEGER(11),
        allowNull: true, // Optional, only for directed messages
        field: 'target_user_id',
    },
    type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'text',
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'normal',
    },
}, {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    timestamps: true,
    underscored: true,
});

// 🧩 Associations
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Message.belongsTo(Chatroom, { foreignKey: 'chatroomId', as: 'chatroom' });
Chatroom.hasMany(Message, { foreignKey: 'chatroomId', as: 'messages' });

// Optional relation if you want to access the "target user" object directly
Message.belongsTo(User, { foreignKey: 'targetUserId', as: 'targetUser' });

module.exports = Message;

const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Message = require('./Message');
const User = require('./User');

class MessageReadStatus extends Model {}

MessageReadStatus.init({
    messageId: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
    },
    userId: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
    },
    read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false, // Default to unread
    },
}, {
    sequelize,
    modelName: 'MessageReadStatus',
    tableName: 'message_read_statuses',
    timestamps: true,
    underscored: true,
});

// Define relationships
MessageReadStatus.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
MessageReadStatus.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Message.hasMany(MessageReadStatus, { foreignKey: 'messageId', as: 'readStatuses' });

module.exports = MessageReadStatus;

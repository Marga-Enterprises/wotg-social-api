const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Meetingroom = require('./Meetingroom'); // Import Meetingroom model
const Chatroom = require('./Chatroom'); // Import Chatroom model
const User = require('./User'); // Import User model

class Participant extends Model {}

Participant.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    // Meeting Room association
    meetingRoomId: {
        type: DataTypes.INTEGER(11),
        references: {
            model: Meetingroom,
            key: 'id',
        },
        allowNull: true, // A participant may not belong to a meeting room
    },
    // Chat Room association
    chatRoomId: {
        type: DataTypes.INTEGER(11),
        references: {
            model: Chatroom,
            key: 'id',
        },
        allowNull: true, // A participant may not belong to a chat room
    },
    userId: {
        type: DataTypes.STRING(255),
        allowNull: false, // Unique ID for the user
    },
    userName: {
        type: DataTypes.STRING(255),
        allowNull: true, // Optional: store the participant's username
    },
    joinedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW, // Automatically track when the user joined
    },
}, {
    sequelize,
    modelName: 'Participant',
    tableName: 'participants',
    timestamps: false, // No need for `createdAt` and `updatedAt` here
    underscored: true,
});

// Associations
Meetingroom.hasMany(Participant, { foreignKey: 'meetingRoomId' });
Participant.belongsTo(Meetingroom, { foreignKey: 'meetingRoomId' });

Chatroom.hasMany(Participant, { foreignKey: 'chatRoomId' });
Participant.belongsTo(Chatroom, { foreignKey: 'chatRoomId' });

// Relating Participant to User (one participant belongs to a user)
User.hasMany(Participant, { foreignKey: 'userId' }); // A user can have many participants
Participant.belongsTo(User, { foreignKey: 'userId', as: 'user' }); // Each participant belongs to a single user

module.exports = Participant;

// app/models/Playlist.js
const { Model, DataTypes } = require('sequelize');
const Music= require('./Music');
const sequelize = require('../../config/db');

class Playlist extends Model {}

Playlist.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    cover_image: {
        type: DataTypes.STRING(255), // File path or URL
        allowNull: true,
    },
    created_by: {
        type: DataTypes.STRING(255), // Replace with user_id if you implement a user model later
        allowNull: false,
    },
    visibility: {
        type: DataTypes.ENUM('public', 'private'),
        allowNull: false,
        defaultValue: 'public',
    },
    total_duration: {
        type: DataTypes.INTEGER, // In seconds (optional)
        allowNull: false,
        defaultValue: 0,
    }
}, {
    sequelize,
    modelName: 'Playlist',
    tableName: 'playlists',
    timestamps: true,
    underscored: true,
});

module.exports = Playlist;

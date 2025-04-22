// app/models/Music.js
const { Model, DataTypes } = require('sequelize');
const Album = require('./Album'); // Assuming you have an Album model
const sequelize = require('../../config/db');

class Music extends Model {}

Music.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    artist_name: {
        type: DataTypes.STRING(255), // You can change this to a relation later
        allowNull: false,
    },
    album_id: {
        type: DataTypes.INTEGER(11), // Must match Album's ID type
        allowNull: true,
        references: {
            model: 'albums',
            key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    },    
    audio_url: {
        type: DataTypes.STRING(255), // File path or streaming URL
        allowNull: false,
    },
    duration: {
        type: DataTypes.INTEGER, // In seconds
        allowNull: false,
    },
    track_number: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    is_explicit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    genre: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    play_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    }
}, {
    sequelize,
    modelName: 'Music',
    tableName: 'music',
    timestamps: true,
    underscored: true,
});

Music.belongsTo(Album, {
    foreignKey: 'album_id',
    targetKey: 'id',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});

module.exports = Music;

// app/models/Album.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

class Album extends Model {}

Album.init({
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
        type: DataTypes.STRING(255), // If you're not using a separate Artist model yet
        allowNull: false,
    },
    cover_image: {
        type: DataTypes.STRING(255), // URL or filename
        allowNull: true,
    },
    release_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    type: {
        type: DataTypes.ENUM('album', 'single', 'compilation'),
        allowNull: false,
        defaultValue: 'album',
    },
    label: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    genre: {
        type: DataTypes.STRING(100),
        allowNull: true,
    }
}, {
    sequelize,
    modelName: 'Album',
    tableName: 'albums',
    timestamps: true,
    underscored: true,
});

module.exports = Album;

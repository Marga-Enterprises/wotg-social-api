// app/models/BibleVerseWeb.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

class BibleVerseWeb extends Model {}

BibleVerseWeb.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    book: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
    },
    chapter: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
    },
    verse: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
    },
    text: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    commentary: {
        type: DataTypes.TEXT('long'),
        allowNull: true, // You can set this to false and add a defaultValue if needed
    },
    language: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: 'eng',
    }
}, {
    sequelize,
    modelName: 'BibleVerseWeb',
    tableName: 'bible_verses_web',
    timestamps: false,
    underscored: true,
});

module.exports = BibleVerseWeb;

// app/models/Meetingroom.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

class Meetingroom extends Model {}

Meetingroom.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false, // No uniqueness constraint on the name
    },
    type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'group', // Can be 'group' or 'private'
    },
}, {
    sequelize,
    modelName: 'Meetingroom', // Use lowercase 'Meetingroom'
    tableName: 'meetingrooms',
    timestamps: true, // Sequelize will automatically handle createdAt/updatedAt
    underscored: true, // Uses snake_case for column names in the database
});

module.exports = Meetingroom;

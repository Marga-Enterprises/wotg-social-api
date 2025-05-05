const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('./User'); // Import User model

class Follow extends Model {}

Follow.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    follower_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false, // Follower user ID
        references: {
            model: 'users',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    following_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false, // User being followed
        references: {
            model: 'users',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    sequelize,
    modelName: 'Follow',
    tableName: 'follows',
    updatedAt: false,
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['follower_id', 'following_id'],
        },
    ],
});

Follow.belongsTo(User, { foreignKey: 'follower_id', as: 'Follower' });
Follow.belongsTo(User, { foreignKey: 'following_id', as: 'Following' });

module.exports = Follow;

const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

// Import related models
const User = require('./User');
const Post = require('./Post');

class Share extends Model {}

Share.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    original_post_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        references: {
            model: 'posts',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true, // Optional message added during sharing
    },
}, {
    sequelize,
    modelName: 'Share',
    tableName: 'shares',
    timestamps: true,
    underscored: true,
});

// Relationships
Share.belongsTo(User, { foreignKey: 'user_id', as: 'sharer' });
User.hasMany(Share, { foreignKey: 'user_id', as: 'shares' });

Share.belongsTo(Post, { foreignKey: 'original_post_id', as: 'original_post' });
Post.hasMany(Share, { foreignKey: 'original_post_id', as: 'shares' });

module.exports = Share;

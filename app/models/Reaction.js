const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

// Import related models
const User = require('./User');
const Post = require('./Post');

class Reaction extends Model {}

Reaction.init({
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
    post_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        references: {
            model: 'posts',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    type: {
        type: DataTypes.ENUM('like', 'love', 'haha', 'wow', 'sad', 'angry'),
        allowNull: false,
        defaultValue: 'like',
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    }
}, {
    sequelize,
    modelName: 'Reaction',
    tableName: 'reactions',
    timestamps: false,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['user_id', 'post_id'], // Prevent duplicate reactions per post per user
        },
    ],
});

// Relationships
Reaction.belongsTo(User, { foreignKey: 'user_id', as: 'reactor' });
User.hasMany(Reaction, { foreignKey: 'user_id', as: 'reactions' });

Reaction.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Post.hasMany(Reaction, { foreignKey: 'post_id', as: 'reactions' });

module.exports = Reaction;

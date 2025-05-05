const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

// Import related models
const User = require('./User');

class Post extends Model {}

Post.init({
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
    content: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    visibility: {
        type: DataTypes.ENUM('public', 'followers', 'private'),
        allowNull: false,
        defaultValue: 'public',
    },
    reaction_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    comments_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    shares_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
}, {
    sequelize,
    modelName: 'Post',
    tableName: 'posts',
    timestamps: true,
    underscored: true,
});

// Relationships

// Author
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });

module.exports = Post;

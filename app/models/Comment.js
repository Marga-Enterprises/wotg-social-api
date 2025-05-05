const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

// Import related models
const User = require('./User');
const Post = require('./Post');

class Comment extends Model {}

Comment.init({
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
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    parent_comment_id: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
        defaultValue: null,
    },
    level: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0, // 0 = comment, 1 = reply
    },
    reply_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
}, {
    sequelize,
    modelName: 'Comment',
    tableName: 'comments',
    timestamps: true,
    underscored: true,
});

// Relationships
Comment.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
User.hasMany(Comment, { foreignKey: 'user_id', as: 'comments' });

Comment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Post.hasMany(Comment, { foreignKey: 'post_id', as: 'comments' });

// Self-referencing for replies
Comment.belongsTo(Comment, { foreignKey: 'parent_comment_id', as: 'parent' });
Comment.hasMany(Comment, { foreignKey: 'parent_comment_id', as: 'replies' });

module.exports = Comment;

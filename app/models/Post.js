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
  original_post_id: {
    type: DataTypes.INTEGER(11),
    allowNull: true, // null = original post
    references: {
      model: 'posts',
      key: 'id',
    },
    onDelete: 'SET NULL',
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
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });

// 🔁 Self-referencing relationships
Post.belongsTo(Post, { foreignKey: 'original_post_id', as: 'original_post' });
Post.hasMany(Post, { foreignKey: 'original_post_id', as: 'shares' });

module.exports = Post;

const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Comment = require('./Comment'); // make sure this path is correct

class CommentMedia extends Model {}

CommentMedia.init({
  id: {
    type: DataTypes.INTEGER(11),
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  comment_id: {
    type: DataTypes.INTEGER(11),
    allowNull: false,
    references: {
      model: 'comments',
      key: 'id'
    },
    onDelete: 'CASCADE',
  },
  url: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('image', 'video', 'audio'),
    allowNull: false,
  },
  thumbnail: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: null,
  }
}, {
  sequelize,
  modelName: 'CommentMedia',
  tableName: 'comment_media',
  timestamps: true,
  underscored: true,
});

// Relationships
CommentMedia.belongsTo(Comment, { foreignKey: 'comment_id', as: 'comment' });
Comment.hasMany(CommentMedia, { foreignKey: 'comment_id', as: 'media' });

module.exports = CommentMedia;

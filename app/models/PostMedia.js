const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

// Import related model
const Post = require('./Post');

class PostMedia extends Model {}

PostMedia.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
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
        type: DataTypes.ENUM('image', 'video'),
        allowNull: false,
    },
    url: {
        type: DataTypes.STRING(500),
        allowNull: false,
    },
    thumbnail: {
        type: DataTypes.STRING(500),
        allowNull: true, // Optional for videos or high-res images
    },
}, {
    sequelize,
    modelName: 'PostMedia',
    tableName: 'post_media',
    timestamps: true,
    underscored: true,
});

// Relationships
PostMedia.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Post.hasMany(PostMedia, { foreignKey: 'post_id', as: 'media' });

module.exports = PostMedia;

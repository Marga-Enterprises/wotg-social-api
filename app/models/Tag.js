const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('./User');
const Post = require('./Post');

class Tag extends Model {}

Tag.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    post_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
    },
}, {
    sequelize,
    modelName: 'Tag',
    tableName: 'tags',
    timestamps: false,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['post_id', 'user_id'],
        },
    ]
});

Tag.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Tag.belongsTo(User, { foreignKey: 'user_id', as: 'taggedUser' });

module.exports = Tag;

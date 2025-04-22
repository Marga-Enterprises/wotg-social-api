const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

class PlaylistMusic extends Model {}

PlaylistMusic.init({
  playlist_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true, // ✅ REQUIRED
    references: { model: 'playlists', key: 'id' },
    onDelete: 'CASCADE'
  },
  music_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true, // ✅ REQUIRED
    references: { model: 'music', key: 'id' },
    onDelete: 'CASCADE'
  }
}, {
  sequelize,
  modelName: 'PlaylistMusic',
  tableName: 'playlist_music',
  timestamps: true,             
  underscored: true,
  id: false // ✅ Tells Sequelize NOT to expect an auto-incrementing ID
});

module.exports = PlaylistMusic;

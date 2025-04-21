// app/models/PlaylistMusic.js (optional, only if you want to query it directly)
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

class PlaylistMusic extends Model {}

PlaylistMusic.init({
  playlist_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'playlists', key: 'id' },
    onDelete: 'CASCADE'
  },
  music_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'music', key: 'id' },
    onDelete: 'CASCADE'
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: true // Optional: for custom track ordering
  }
}, {
  sequelize,
  modelName: 'PlaylistMusic',
  tableName: 'playlist_music',
  timestamps: false
});



module.exports = PlaylistMusic;

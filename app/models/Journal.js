// app/models/Journal.js
const { Model, DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

class Journal extends Model {}

Journal.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  book: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false
  },
  chapter: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false
  },
  verse: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false
  },
  language: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'eng'
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT("long"),
    allowNull: false
  },
  private: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  sequelize,
  modelName: "Journal",
  tableName: "journals",
  timestamps: true,
  underscored: true
});

module.exports = Journal;

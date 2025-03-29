const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Journal = sequelize.define("Journal", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  book: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  chapter: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  verse: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: "journals",
  timestamps: true
});

module.exports = Journal;

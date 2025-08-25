const { Model, DataTypes } = require("sequelize");
const sequelize = require("../../config/db");

class GuestBotState extends Model {}

GuestBotState.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    unique: true
  },
  currentStep: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'awaiting_name'
  },
  fullName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  mobile: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  fbName: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  sequelize,
  modelName: "GuestBotState",
  tableName: "guest_bot_states",
  timestamps: true,
  underscored: true
});

module.exports = GuestBotState;

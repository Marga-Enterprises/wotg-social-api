const { Model, DataTypes } = require("sequelize");
const sequelize = require("../../config/db");
const Message = require("./Message");
const User = require("./User");

class MessageReact extends Model {}

MessageReact.init(
  {
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Message,
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    react: {
      type: DataTypes.STRING, // Stores reaction (e.g., "heart", "like", "pray")
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "MessageReact",
    tableName: "message_reacts",
    timestamps: true,
    underscored: true,
  }
);

// Define relationships
MessageReact.belongsTo(Message, { foreignKey: "messageId", as: "message" });
MessageReact.belongsTo(User, { foreignKey: "userId", as: "user" });
Message.hasMany(MessageReact, { foreignKey: "messageId", as: "reactions" }); // Updated alias

module.exports = MessageReact;

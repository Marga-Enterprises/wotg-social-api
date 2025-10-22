const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

class User extends Model {}

User.init({
    id: {
        type: DataTypes.INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    user_fname: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    user_lname: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    user_role: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        index: true,
    },
    verification_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    user_gender: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: null,
    },
    user_mobile_number: {
        type: DataTypes.STRING(15),
        allowNull: true,
        defaultValue: null,
    },
    user_social_media: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    user_church_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    user_birthday: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null,
    },
    user_country: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
    },
    user_city: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
    },
    user_dgroup_leader: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    approval_token: {
        type: DataTypes.STRING(60),
        allowNull: true,
        defaultValue: null,
        index: true,
    },
    user_ministry: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    user_already_a_dgroup_leader: {
        type: DataTypes.TINYINT(1),
        allowNull: true,
        defaultValue: 0,
    },
    user_already_a_dgroup_member: {
        type: DataTypes.TINYINT(1),
        allowNull: true,
        defaultValue: 0,
    },
    user_profile_picture: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    user_nickname: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    user_meeting_day: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
    },
    user_meeting_time: {
        type: DataTypes.TIME,
        allowNull: true,
        defaultValue: null,
    },
    user_profile_banner: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    refreshToken: { 
        type: DataTypes.TEXT, 
        allowNull: true,
    },
    reset_password_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
    },
    reset_password_expires: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },

    // ✅ New Fields
    registered_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Date and time the user registered',
    },
    guest_account: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Indicates if the user is a guest account',
    },
    guest_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
    },
}, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: false,
    underscored: true,
});

module.exports = User;

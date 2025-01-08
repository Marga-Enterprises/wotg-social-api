const path = require('path');

// Forcefully load environment variables from the specific path of the .env file
require('dotenv').config({
  path: path.resolve(__dirname, '.env') // Forcefully specify the path to .env
});

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
    }
);

sequelize.authenticate()
    .then(() => console.log('Database connected...'))
    .catch(err => console.log('Error: ' + err));

module.exports = sequelize;

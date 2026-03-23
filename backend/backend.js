import mysql from "mysql2/promise"

const isTestMode = process.env.NODE_ENV === 'test';

export const connection = await mysql.createPool({
  host: isTestMode ? process.env.TEST_DB_HOST : process.env.DB_HOST,
  port: isTestMode ? process.env.TEST_DB_PORT : process.env.DB_PORT,
  user: isTestMode ? process.env.TEST_DB_USERNAME : process.env.DB_USERNAME,
  password: isTestMode ? process.env.TEST_DB_PASSWORD : process.env.DB_PASSWORD,
  database: isTestMode ? process.env.TEST_DB_DATABASE : process.env.DB_DATABASE,
  connectionLimit: 10
})


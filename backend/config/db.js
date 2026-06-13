const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
   ssl: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  typeCast(field, next) {
    if (field.type === "DATE" || field.type === "DATETIME" || field.type === "TIMESTAMP") {
      return field.string();
    }
    if (field.type === "DECIMAL" || field.type === "NEWDECIMAL") {
      const val = field.string();
      return val === null ? null : parseFloat(val);
    }
    return next();
  },
});

module.exports = pool;

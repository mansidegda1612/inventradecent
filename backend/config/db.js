const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Mansi@1612",
    database: "inventradecent_db"
})

connection.connect((err) => {
    if (err) {
        console.log("Database connection failed: ", err);
    }
    else {
        console.log("Connection succsesful");
    }
});

module.exports = connection;
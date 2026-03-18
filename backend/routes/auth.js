const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

exports.login = (req , res) => {
    let {userid , password} = req.body;

    let sql = `SELECT ID , USER_ID , PASSWORD , NAME , USERROLE , RIGHTS 
    FROM USER  WHERE USER_ID = ?;`

    db.query(sql , [userid], async(err , result)=>{
        
        if (result.length === 0)
            return res.status(401).json({ message: "User not found" });
        let user = result[0],
        valid = await bcrypt.compare(password , user.PASSWORD)

         if (!valid)
             return res.status(401).json({ message: "Invalid password" });

         const token = jwt.sign(
            { id: user.ID, userid: user.USER_ID },
            "secretkey",
            { expiresIn: "8h" }
            );
        res.json({
            token,
            user: {
                id: user.ID,
                name: user.NAME,
                role: user.USERROLE
            }
        });
    });
}

exports.userDetail = (req , res) => {

    let sql = `SELECT ID , USER_ID , PASSWORD , NAME , USERROLE , RIGHTS 
    FROM USER  WHERE ID = ?;`

    db.query(sql , [req.user.id], async(err , result)=>{
        
        if (result.length === 0)
            return res.status(401).json({ message: "User not found" });
        let user = result[0];
        
        res.json(user);
    });
}
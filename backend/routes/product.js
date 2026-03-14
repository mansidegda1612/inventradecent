const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/", (req, res)=> {
    db.query("SELECT * FROM product;", (err , result)=> {
        if(err){
            res.status(500).json(err);
        }
        else
        {
            res.json(result);
        }
    })
});

module.exports = router;
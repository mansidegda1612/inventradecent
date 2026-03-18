const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

app.get("/",(req,res)=>{
    res.send("InventraDecent API running");
});

const auth = require("./routes/auth")
const authMiddleware = require("./middleware/AuthMiddleware");
router.post("/api/auth/login",auth.login);
router.get("/api/auth/userDetail",authMiddleware,auth.userDetail);

app.use(router);

const port = "5000";

app.listen(port , ()=> {
    console.log(`server running on port ${port}`);
});

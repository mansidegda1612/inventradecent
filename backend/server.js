const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/",(req,res)=>{
    res.send("InventraDecent API running");
});

const productRoute = require("./routes/product");

app.use("/api/products",productRoute);


const port = "5000";

app.listen(port , ()=> {
    console.log(`server running on port ${port}`);
});

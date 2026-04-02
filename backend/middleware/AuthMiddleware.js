const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Access token missing" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "secret");
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

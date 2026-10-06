const router = require("express").Router();
const { getMessages } = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/:roomId", authMiddleware, getMessages);

module.exports = router;
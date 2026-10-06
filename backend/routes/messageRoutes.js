const router = require("express").Router();
const { getMessages, sendMessage } = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/:roomId", authMiddleware, getMessages);
router.post("/:roomId", authMiddleware, sendMessage);

module.exports = router;
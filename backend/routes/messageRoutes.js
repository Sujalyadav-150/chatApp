const router = require("express").Router();
const { getMessages, sendMessage, deleteMessage } = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/:roomId", authMiddleware, getMessages);
router.post("/:roomId", authMiddleware, sendMessage);
router.delete("/:roomId/:messageId", authMiddleware, deleteMessage);

module.exports = router;
const router = require("express").Router();
const { suggest, smartReplies } = require("../controllers/aiController");
const authMiddleware = require("../middleware/authMiddleware");
const aiRateLimit = require("../middleware/aiRateLimit");

router.post("/suggest", authMiddleware, aiRateLimit, suggest);
router.post("/replies", authMiddleware, aiRateLimit, smartReplies);

module.exports = router;

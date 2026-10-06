const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getMe, checkUser, listUsers } = require("../controllers/userController");

router.get("/me", authMiddleware, getMe);
router.get("/check", authMiddleware, checkUser);
router.get("/", authMiddleware, listUsers);

module.exports = router;
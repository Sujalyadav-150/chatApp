const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const { createGroup, getMyGroups, getGroup } = require("../controllers/groupController");

router.post("/", authMiddleware, createGroup);
router.get("/", authMiddleware, getMyGroups);
router.get("/:id", authMiddleware, getGroup);

module.exports = router;
const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const { upload } = require("../middleware/upload");
const { uploadMedia } = require("../controllers/uploadController");

// multipart/form-data, field name "file"
router.post("/", authMiddleware, upload.single("file"), uploadMedia);

module.exports = router;
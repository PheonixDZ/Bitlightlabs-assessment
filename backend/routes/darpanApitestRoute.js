const express = require("express");
const { getDarpanApitest, getDarpanApitestToken } = require("../controllers/darpanApitestController");

const router = express.Router();

router.route("/").get(getDarpanApitest);
router.route("/token/:address").get(getDarpanApitestToken);

module.exports = router;

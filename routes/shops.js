const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const SHOPS_PATH = path.join(__dirname, '..', 'data', 'shops.json');
router.get('/', (req, res) => res.json(JSON.parse(fs.readFileSync(SHOPS_PATH, 'utf-8'))));
module.exports = router;
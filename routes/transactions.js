const express = require('express');
const router = express.Router();
const { readDb, writeDb } = require('../db');
router.post('/', (req, res) => {
  const { userId, shopId, amount, item, source } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: 'userId and amount are required' });
  const db = readDb();
  const newTransaction = { id: Date.now(), userId, shopId: shopId || null, amount, item: item || '', date: new Date().toISOString().slice(0, 10), source: source || 'manual' };
  db.transactions.push(newTransaction);
  writeDb(db);
  res.json(newTransaction);
});
router.get('/', (req, res) => {
  const { userId } = req.query;
  const db = readDb();
  let results = db.transactions;
  if (userId) results = results.filter(t => t.userId == userId);
  res.json(results);
});
module.exports = router;
const express = require('express');
const router = express.Router();
const { readDb, writeDb } = require('../db');
router.post('/', (req, res) => {
  const { name, phone, email, avatar } = req.body;
  if (!name || !phone || !email) return res.status(400).json({ error: 'name, phone and email are all required' });
  const db = readDb();
  const newUser = { id: Date.now(), name, phone, email, avatar: avatar || 'boy' };
  db.users.push(newUser);
  writeDb(db);
  res.json(newUser);
});
router.get('/:id', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(user);
});
module.exports = router;
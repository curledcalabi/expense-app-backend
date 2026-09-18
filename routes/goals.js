const express = require('express');
const router = express.Router();
const { readDb, writeDb } = require('../db');
router.post('/', (req, res) => {
  const { userId, title, target, saved } = req.body;
  if (!userId || !target) return res.status(400).json({ error: 'userId and target are required' });
  const db = readDb();
  let goal = db.goals.find(g => g.userId == userId);
  if (goal) {
    goal.title = title ?? goal.title;
    goal.target = target ?? goal.target;
    goal.saved = saved ?? goal.saved;
  } else {
    goal = { id: Date.now(), userId, title: title || 'My Goal', target, saved: saved || 0 };
    db.goals.push(goal);
  }
  writeDb(db);
  res.json(goal);
});
router.get('/', (req, res) => {
  const { userId } = req.query;
  const db = readDb();
  res.json(db.goals.find(g => g.userId == userId) || null);
});
module.exports = router;
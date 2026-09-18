const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'db.json');
function ensureDbExists() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], transactions: [], goals: [] }, null, 2));
  }
}
function readDb() { ensureDbExists(); return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function writeDb(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
module.exports = { readDb, writeDb };
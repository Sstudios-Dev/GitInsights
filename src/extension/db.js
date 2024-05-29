const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbFolderPath = path.join(__dirname, '..', 'database');
const dbPath = path.join(dbFolderPath, 'github-stats.db');
const db = new sqlite3.Database(dbPath);

// Crear la carpeta si no existe
if (!fs.existsSync(dbFolderPath)) {
  fs.mkdirSync(dbFolderPath);
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    full_name TEXT,
    html_url TEXT,
    description TEXT,
    forks_count INTEGER,
    stargazers_count INTEGER,
    watchers_count INTEGER,
    created_at TEXT,
    updated_at TEXT,
    language TEXT
  )`);
});

module.exports = db;
import Database from 'better-sqlite3';
import { existsSync } from 'fs';

let db;

export function initDb(dbPath = './state.db') {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS plays (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id    TEXT NOT NULL,
      song_name  TEXT NOT NULL,
      artist     TEXT NOT NULL,
      album      TEXT,
      source     TEXT DEFAULT 'manual',
      played_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      skipped    INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plan (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slot       TEXT NOT NULL,
      songs_json TEXT,
      reason     TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prefs (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function recordPlay(song, source = 'manual') {
  return getDb().prepare(
    'INSERT INTO plays (song_id, song_name, artist, album, source) VALUES (?, ?, ?, ?, ?)'
  ).run(song.id || song.song_id, song.name || song.song_name, song.artist, song.album || null, source);
}

export function getRecentPlays(limit = 20) {
  return getDb().prepare(
    'SELECT * FROM plays ORDER BY played_at DESC LIMIT ?'
  ).all(limit);
}

export function markRecentPlaySkipped() {
  const recent = getRecentPlays(1)[0];
  if (!recent) return { changed: 0 };
  return getDb().prepare('UPDATE plays SET skipped = 1 WHERE id = ?').run(recent.id);
}

export function saveMessage(role, content) {
  return getDb().prepare(
    'INSERT INTO messages (role, content) VALUES (?, ?)'
  ).run(role, content);
}

export function getRecentMessages(limit = 10) {
  return getDb().prepare(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT ?'
  ).all(limit).reverse();
}

export function savePlan(slot, songs, reason) {
  return getDb().prepare(
    'INSERT INTO plan (slot, songs_json, reason) VALUES (?, ?, ?)'
  ).run(slot, JSON.stringify(songs), reason);
}

export function getTodayPlan() {
  return getDb().prepare(
    "SELECT * FROM plan WHERE date(created_at, 'localtime') = date('now', 'localtime') ORDER BY id"
  ).all();
}

export function getPref(key) {
  const row = getDb().prepare('SELECT value FROM prefs WHERE key = ?').get(key);
  return row?.value;
}

export function setPref(key, value) {
  return getDb().prepare(
    'INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)'
  ).run(key, value);
}

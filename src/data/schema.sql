-- 待办表：小派的"会做"落地点之一
CREATE TABLE IF NOT EXISTS todos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  done_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos (status, due_date);

-- 长期记忆表：key 唯一，同一件事重复说只更新不新增，避免记忆膨胀
CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT UNIQUE,
  content    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'preference' CHECK (category IN ('profile', 'preference', 'event')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories (updated_at DESC);

-- 记账表：金额单位是元，spent_on 记"哪天花的"而不是"哪天记的"
CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  amount     REAL NOT NULL CHECK (amount > 0),
  category   TEXT NOT NULL DEFAULT '其他',
  note       TEXT NOT NULL DEFAULT '',
  spent_on   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (spent_on DESC);

-- 倒数日：考试、纪念日、截止日都放这里
CREATE TABLE IF NOT EXISTS countdowns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  target_date TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_countdowns_date ON countdowns (target_date);

-- ./init.sql
-- 使用者與聊天識別
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,          -- Telegram @username
  chat_id  INTEGER NOT NULL           -- Telegram chat_id（發訊必需）
);

-- 提醒事項
CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL,       -- 對應 users.username
  content     TEXT    NOT NULL,       -- 提醒內容
  match_time  TEXT    NOT NULL        -- “HH”24 小時字串，例 '09'、'17'
);

-- 依需求建立索引
CREATE INDEX IF NOT EXISTS idx_reminders_match_time
  ON reminders(match_time);

-- 新增 UUID 欄位到 reminders 表
-- ① 新增欄位
ALTER TABLE reminders ADD COLUMN uuid TEXT;

-- ② 針對 uuid 建立唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_uuid ON reminders(uuid);

-- 若尚未有 open_hour / close_hour，請先執行
ALTER TABLE users ADD COLUMN open_hour TEXT DEFAULT '00';   -- 營業開始 'HH'
ALTER TABLE users ADD COLUMN close_hour TEXT DEFAULT '23';  -- 營業結束 'HH'
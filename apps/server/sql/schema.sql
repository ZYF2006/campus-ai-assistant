-- MySQL 8；重复初始化只补建表，不删除已有数据。
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  title VARCHAR(40) NOT NULL,
  summary MEDIUMTEXT NOT NULL,
  -- 摘要已覆盖的完整轮数；一轮等于一问一答两条消息。
  summary_through INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_sessions_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  -- 一问一答共用 turn_index，确保历史按完整对话轮排序。
  turn_index INT UNSIGNED NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_messages_turn_role (session_id, turn_index, role),
  CONSTRAINT fk_messages_session FOREIGN KEY (session_id)
    REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

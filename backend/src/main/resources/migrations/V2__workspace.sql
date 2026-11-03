CREATE TABLE IF NOT EXISTS planner_extra (
 kind VARCHAR(32) NOT NULL,
 record_id VARCHAR(36) NOT NULL,
 payload LONGTEXT NOT NULL,
 PRIMARY KEY(kind, record_id)
);
CREATE TABLE IF NOT EXISTS planner_meta (
 meta_key VARCHAR(36) PRIMARY KEY,
 meta_value VARCHAR(100) NOT NULL
);

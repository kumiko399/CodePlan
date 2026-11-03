CREATE TABLE IF NOT EXISTS problem (
 id VARCHAR(36) PRIMARY KEY, platform VARCHAR(80) NOT NULL, number VARCHAR(50), title VARCHAR(200) NOT NULL,
 url VARCHAR(1000), difficulty VARCHAR(20) NOT NULL, tags VARCHAR(1000), notes TEXT NOT NULL,
 identity_key VARCHAR(64) UNIQUE
);
CREATE TABLE IF NOT EXISTS repeat_rule (
 id VARCHAR(36) PRIMARY KEY, title VARCHAR(100) NOT NULL, category VARCHAR(20) NOT NULL,
 priority VARCHAR(10) NOT NULL, notes TEXT NOT NULL, task_time VARCHAR(5), reminder_time VARCHAR(5),
 start_date DATE NOT NULL, end_date DATE, frequency VARCHAR(10) NOT NULL, weekdays VARCHAR(20) NOT NULL,
 problem_id VARCHAR(36), active BOOLEAN NOT NULL, cursor_date DATE,
 FOREIGN KEY(problem_id) REFERENCES problem(id)
);
CREATE TABLE IF NOT EXISTS task (
 id VARCHAR(36) PRIMARY KEY, title VARCHAR(100) NOT NULL, category VARCHAR(20) NOT NULL,
 plan_date DATE NOT NULL, task_time VARCHAR(5), priority VARCHAR(10) NOT NULL, notes TEXT NOT NULL,
 status VARCHAR(20) NOT NULL, completed_at TIMESTAMP NULL, problem_id VARCHAR(36),
 rule_id VARCHAR(36), occurrence_date DATE, reminder_time VARCHAR(5), notified BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(problem_id) REFERENCES problem(id), FOREIGN KEY(rule_id) REFERENCES repeat_rule(id),
 UNIQUE(rule_id, occurrence_date), INDEX idx_task_date(plan_date)
);
CREATE TABLE IF NOT EXISTS attempt (
 id VARCHAR(36) PRIMARY KEY, problem_id VARCHAR(36) NOT NULL, task_id VARCHAR(36),
 attempted_at TIMESTAMP NOT NULL, result VARCHAR(10) NOT NULL, minutes INT, notes TEXT NOT NULL,
 FOREIGN KEY(problem_id) REFERENCES problem(id), FOREIGN KEY(task_id) REFERENCES task(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS reflection (
 `day` DATE PRIMARY KEY, content TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_setting (
 id INT PRIMARY KEY, language VARCHAR(5) NOT NULL, theme VARCHAR(10) NOT NULL, color VARCHAR(10) NOT NULL,
 repeat_enabled BOOLEAN NOT NULL, reminders_enabled BOOLEAN NOT NULL, auto_backup BOOLEAN NOT NULL,
 backup_directory VARCHAR(2000) NOT NULL, last_auto_backup DATE
);
INSERT INTO app_setting (id,language,theme,color,repeat_enabled,reminders_enabled,auto_backup,backup_directory,last_auto_backup)
SELECT 1,'zh','system','blue',FALSE,FALSE,FALSE,'',NULL WHERE NOT EXISTS (SELECT 1 FROM app_setting WHERE id=1);

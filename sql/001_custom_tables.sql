-- AlgoBeat custom tables.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS `problem_solution` (
  `id` INT NOT NULL AUTO_INCREMENT, `title` VARCHAR(80) DEFAULT NULL,
  `content` MEDIUMTEXT DEFAULT NULL, `problem_id` INT DEFAULT NULL,
  `user_id` INT DEFAULT NULL, `status` VARCHAR(20) DEFAULT 'pending',
  `public_time` INT DEFAULT NULL, `update_time` INT DEFAULT NULL,
  `reject_reason` VARCHAR(255) DEFAULT NULL, `allow_comment` BOOLEAN DEFAULT TRUE,
  `comments_num` INT DEFAULT 0,
  `reviewer_id` INT DEFAULT NULL, `reviewed_at` INT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_problem_id` (`problem_id`), KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`), KEY `idx_problem_status` (`problem_id`, `status`),
  KEY `idx_reviewer` (`reviewer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `problem_solution_comment` (
  `id` INT NOT NULL AUTO_INCREMENT, `content` TEXT DEFAULT NULL,
  `solution_id` INT DEFAULT NULL, `user_id` INT DEFAULT NULL,
  `public_time` INT DEFAULT NULL, PRIMARY KEY (`id`),
  KEY `idx_solution_id` (`solution_id`), KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `problem_solution_setting` (
  `problem_id` INT NOT NULL, `disable_submission` BOOLEAN DEFAULT FALSE,
  `update_time` INT DEFAULT NULL, `updated_by` INT DEFAULT NULL,
  PRIMARY KEY (`problem_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `announcement` (
  `id` INT NOT NULL AUTO_INCREMENT, `title` VARCHAR(120) DEFAULT NULL,
  `content` MEDIUMTEXT DEFAULT NULL, `level` VARCHAR(20) DEFAULT 'info',
  `start_time` INT DEFAULT NULL, `end_time` INT DEFAULT NULL,
  `is_active` BOOLEAN DEFAULT TRUE, `public_time` INT DEFAULT NULL,
  `update_time` INT DEFAULT NULL, PRIMARY KEY (`id`),
  KEY `idx_active_time` (`is_active`, `start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `private_message` (
  `id` INT NOT NULL AUTO_INCREMENT, `sender_id` INT DEFAULT NULL,
  `receiver_id` INT DEFAULT NULL, `content` TEXT DEFAULT NULL,
  `public_time` INT DEFAULT NULL, `is_read` BOOLEAN DEFAULT FALSE,
  `sender_deleted` BOOLEAN DEFAULT FALSE, `receiver_deleted` BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (`id`), KEY `idx_sender` (`sender_id`),
  KEY `idx_receiver` (`receiver_id`), KEY `idx_pair` (`sender_id`, `receiver_id`),
  KEY `idx_unread` (`receiver_id`, `is_read`, `receiver_deleted`),
  KEY `idx_time` (`public_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_message_setting` (
  `user_id` INT NOT NULL, `disable_messages` BOOLEAN DEFAULT FALSE,
  `update_time` INT DEFAULT NULL, PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `clipboard_item` (
  `id` INT NOT NULL AUTO_INCREMENT, `user_id` INT DEFAULT NULL,
  `title` VARCHAR(120) DEFAULT NULL, `content` MEDIUMTEXT DEFAULT NULL,
  `visibility` VARCHAR(20) DEFAULT 'private', `share_token` VARCHAR(40) DEFAULT NULL,
  `share_expires` INT DEFAULT NULL, `public_time` INT DEFAULT NULL,
  `update_time` INT DEFAULT NULL, PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`), KEY `idx_visibility` (`visibility`),
  UNIQUE KEY `uniq_share_token` (`share_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `problem_set` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `title` VARCHAR(80) NOT NULL,
  `description` MEDIUMTEXT DEFAULT NULL,
  `visibility` VARCHAR(20) DEFAULT 'private',
  `items_count` INT DEFAULT 0,
  `created_at` INT NOT NULL,
  `updated_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_updated` (`user_id`, `updated_at`),
  KEY `idx_visibility_updated` (`visibility`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `problem_set_item` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `set_id` INT NOT NULL,
  `problem_id` INT NOT NULL,
  `sort_order` INT DEFAULT 0,
  `note` VARCHAR(200) DEFAULT NULL,
  `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_set_problem` (`set_id`, `problem_id`),
  KEY `idx_set_order` (`set_id`, `sort_order`),
  KEY `idx_problem` (`problem_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `problem_favorite` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `problem_id` INT NOT NULL,
  `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_problem` (`user_id`, `problem_id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_problem` (`problem_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `email_verification_token` (
  `token` VARCHAR(64) NOT NULL, `user_id` INT NOT NULL,
  `email` VARCHAR(120) DEFAULT NULL, `purpose` VARCHAR(20) DEFAULT 'register',
  `created_at` INT DEFAULT NULL, `expires_at` INT DEFAULT NULL,
  `used` BOOLEAN DEFAULT FALSE, PRIMARY KEY (`token`),
  KEY `idx_user_id` (`user_id`), KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_email_status` (
  `user_id` INT NOT NULL, `is_email_verified` BOOLEAN DEFAULT FALSE,
  `verified_at` INT DEFAULT NULL, `last_send_at` INT DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_hit_score` (
  `user_id` INT NOT NULL, `total` INT DEFAULT 0,
  `basic_score` INT DEFAULT 0, `contribution_score` INT DEFAULT 0,
  `contest_score` INT DEFAULT 0, `practice_score` INT DEFAULT 0,
  `last_calc_at` INT DEFAULT NULL, PRIMARY KEY (`user_id`),
  KEY `idx_total` (`total`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_hit_score_history` (
  `id` INT NOT NULL AUTO_INCREMENT, `user_id` INT NOT NULL,
  `total` INT DEFAULT 0, `basic_score` INT DEFAULT 0,
  `contribution_score` INT DEFAULT 0, `contest_score` INT DEFAULT 0,
  `practice_score` INT DEFAULT 0, `recorded_at` INT NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_user_time` (`user_id`, `recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_hit_setting` (
  `user_id` INT NOT NULL, `hide_hit` BOOLEAN DEFAULT FALSE,
  `update_time` INT DEFAULT NULL, PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `judge_state_admin_action` (
  `judge_id` INT NOT NULL, `action_type` VARCHAR(20) NOT NULL,
  `operator_id` INT NOT NULL, `operator_time` INT NOT NULL,
  `reason` VARCHAR(255) DEFAULT NULL, `was_accepted` BOOLEAN DEFAULT FALSE,
  `affected_problem_id` INT DEFAULT NULL, `affected_user_id` INT DEFAULT NULL,
  PRIMARY KEY (`judge_id`),
  KEY `idx_user_action` (`affected_user_id`, `action_type`),
  KEY `idx_problem_user` (`affected_problem_id`, `affected_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ticket` (
  `id` INT NOT NULL AUTO_INCREMENT, `category` VARCHAR(20) NOT NULL,
  `subtype` VARCHAR(60) NOT NULL, `title` VARCHAR(200) NOT NULL,
  `description` MEDIUMTEXT, `creator_id` INT NOT NULL,
  `assignee_id` INT DEFAULT NULL, `status` VARCHAR(20) DEFAULT 'pending',
  `relation_type` VARCHAR(20) DEFAULT NULL, `relation_id` INT DEFAULT NULL,
  `extra_data` TEXT, `is_public` BOOLEAN DEFAULT FALSE,
  `created_at` INT NOT NULL, `updated_at` INT NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_creator` (`creator_id`),
  KEY `idx_status` (`status`), KEY `idx_category` (`category`),
  KEY `idx_assignee` (`assignee_id`),
  KEY `idx_relation` (`relation_type`, `relation_id`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ticket_reply` (
  `id` INT NOT NULL AUTO_INCREMENT, `ticket_id` INT NOT NULL,
  `user_id` INT NOT NULL, `content` MEDIUMTEXT NOT NULL,
  `is_internal` BOOLEAN DEFAULT FALSE, `is_status_change` BOOLEAN DEFAULT FALSE,
  `created_at` INT NOT NULL, PRIMARY KEY (`id`),
  KEY `idx_ticket` (`ticket_id`), KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ticket_attachment` (
  `id` INT NOT NULL AUTO_INCREMENT, `ticket_id` INT NOT NULL,
  `reply_id` INT DEFAULT NULL, `uploader_id` INT NOT NULL,
  `filename` VARCHAR(255) NOT NULL, `original_name` VARCHAR(255) NOT NULL,
  `file_size` INT NOT NULL, `mime_type` VARCHAR(120),
  `created_at` INT NOT NULL, PRIMARY KEY (`id`),
  KEY `idx_ticket` (`ticket_id`), KEY `idx_reply` (`reply_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_tag` (
  `user_id` INT NOT NULL,
  `tag_text` VARCHAR(12) DEFAULT '',
  `is_visible` BOOLEAN DEFAULT TRUE,
  `granted_by` INT DEFAULT NULL, `granted_at` INT DEFAULT NULL,
  `is_disabled` BOOLEAN DEFAULT FALSE,
  `disabled_by` INT DEFAULT NULL, `disabled_at` INT DEFAULT NULL,
  `disabled_reason` VARCHAR(255) DEFAULT NULL,
  `updated_at` INT DEFAULT NULL, PRIMARY KEY (`user_id`),
  KEY `idx_disabled` (`is_disabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notification` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `recipient_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT,
  `source_url` VARCHAR(500),
  `source_id` INT,
  `actor_id` INT,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` INT NOT NULL,
  `read_at` INT,
  PRIMARY KEY (`id`),
  KEY `idx_recipient_unread` (`recipient_id`, `is_read`),
  KEY `idx_recipient_created` (`recipient_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `homepage_banner` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(100) NOT NULL,
  `image_path` VARCHAR(500) NOT NULL,
  `link_url` VARCHAR(500),
  `sort_order` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `start_time` INT, `end_time` INT,
  `created_by` INT, `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_active_sort` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_follow` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `follower_id` INT NOT NULL,
  `followee_id` INT NOT NULL,
  `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_follow` (`follower_id`, `followee_id`),
  KEY `idx_followee` (`followee_id`),
  KEY `idx_follower` (`follower_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `benben_post` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `reply_to` INT,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_reply_to` (`reply_to`),
  KEY `idx_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `benben_image` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `post_id` INT NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255),
  `uploader_id` INT NOT NULL,
  `file_size` INT,
  `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_post` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `actor_id` INT DEFAULT NULL,
  `action` VARCHAR(80) NOT NULL,
  `target_type` VARCHAR(80) DEFAULT NULL,
  `target_id` INT DEFAULT NULL,
  `detail_json` TEXT,
  `ip` VARCHAR(64) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_actor_created` (`actor_id`, `created_at`),
  KEY `idx_action` (`action`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

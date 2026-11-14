-- Habitly PostgreSQL schema source. Apply to Replit development DB, then use Publish to promote.

CREATE TABLE community_circles (
	id VARCHAR(36) NOT NULL,
	name VARCHAR(100) NOT NULL,
	identity VARCHAR(120) NOT NULL,
	description VARCHAR(300) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (name)
);

CREATE TABLE users (
	id VARCHAR(36) NOT NULL,
	email VARCHAR(320),
	password_hash VARCHAR(256),
	api_token_hash VARCHAR(64),
	telegram_chat_id VARCHAR(64),
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (email),
	UNIQUE (api_token_hash),
	UNIQUE (telegram_chat_id)
);

CREATE TABLE account_tokens (
	token_hash VARCHAR(64) NOT NULL,
	user_id VARCHAR(36) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (token_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE identities (
	id VARCHAR(36) NOT NULL,
	user_id VARCHAR(36) NOT NULL,
	identity_statement VARCHAR(240) NOT NULL,
	total_votes INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE telegram_links (
	token VARCHAR(80) NOT NULL,
	user_id VARCHAR(36) NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (token),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE workspace_states (
	user_id VARCHAR(36) NOT NULL,
	payload JSON NOT NULL,
	revision INTEGER NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE circle_memberships (
	id VARCHAR(36) NOT NULL,
	circle_id VARCHAR(36) NOT NULL,
	identity_id VARCHAR(36) NOT NULL,
	joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_circle_identity UNIQUE (circle_id, identity_id),
	FOREIGN KEY(circle_id) REFERENCES community_circles (id) ON DELETE CASCADE,
	FOREIGN KEY(identity_id) REFERENCES identities (id) ON DELETE CASCADE
);

CREATE TABLE habit_diagnostics (
	id VARCHAR(36) NOT NULL,
	identity_id VARCHAR(36) NOT NULL,
	routine VARCHAR(300) NOT NULL,
	craving VARCHAR(300) NOT NULL,
	reward_experiment VARCHAR(300) NOT NULL,
	cue_time VARCHAR(120),
	cue_location VARCHAR(200),
	cue_emotion VARCHAR(200),
	cue_people VARCHAR(200),
	plan VARCHAR(500) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(identity_id) REFERENCES identities (id) ON DELETE CASCADE
);

CREATE TABLE habits (
	id VARCHAR(36) NOT NULL,
	identity_id VARCHAR(36) NOT NULL,
	habit_type VARCHAR(8) NOT NULL,
	target_action VARCHAR(300) NOT NULL,
	gateway_action VARCHAR(300) NOT NULL,
	gateway_minutes INTEGER NOT NULL,
	cue_type VARCHAR(20) NOT NULL,
	cue_trigger VARCHAR(300) NOT NULL,
	location VARCHAR(200),
	craving_motive VARCHAR(300) NOT NULL,
	reward_payoff VARCHAR(300) NOT NULL,
	prep_step VARCHAR(300),
	reward_bundle VARCHAR(300),
	cue_to_hide VARCHAR(300),
	friction_strategy VARCHAR(300),
	habit_contract VARCHAR(300),
	motivation_ritual VARCHAR(300),
	shaping_milestones VARCHAR(1200),
	shaping_current_step INTEGER NOT NULL,
	accountability_partner VARCHAR(200),
	accountability_partner_email VARCHAR(320),
	accountability_cost VARCHAR(300),
	alternative_routine VARCHAR(300),
	aversion_reminder VARCHAR(300),
	technique_ids JSON NOT NULL,
	technique_notes JSON NOT NULL,
	baseline_daily INTEGER,
	friction_votes INTEGER NOT NULL,
	is_active BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(identity_id) REFERENCES identities (id) ON DELETE CASCADE
);

CREATE TABLE accountability_invites (
	id VARCHAR(36) NOT NULL,
	habit_id VARCHAR(36) NOT NULL,
	partner_email VARCHAR(320) NOT NULL,
	partner_name VARCHAR(200),
	token VARCHAR(80) NOT NULL,
	status VARCHAR(20) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE CASCADE,
	UNIQUE (token)
);

CREATE TABLE habit_contracts (
	id VARCHAR(36) NOT NULL,
	habit_id VARCHAR(36) NOT NULL,
	agreement VARCHAR(300) NOT NULL,
	consequence VARCHAR(300) NOT NULL,
	partner_name VARCHAR(200) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (habit_id),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE CASCADE
);

CREATE TABLE habit_events (
	id VARCHAR(36) NOT NULL,
	habit_id VARCHAR(36) NOT NULL,
	event_type VARCHAR(24) NOT NULL,
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
	note TEXT,
	strategy VARCHAR(300),
	variation_id VARCHAR(36),
	variation_name VARCHAR(160),
	PRIMARY KEY (id),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE CASCADE
);

CREATE TABLE habit_logs (
	id VARCHAR(36) NOT NULL,
	habit_id VARCHAR(36) NOT NULL,
	logged_date DATE NOT NULL,
	status VARCHAR(12) NOT NULL,
	completed_via VARCHAR(20) NOT NULL,
	environment_prepped BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_habit_log_day UNIQUE (habit_id, logged_date),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE CASCADE
);

CREATE TABLE habit_variations (
	id VARCHAR(36) NOT NULL,
	habit_id VARCHAR(36) NOT NULL,
	law VARCHAR(24) NOT NULL,
	name VARCHAR(160) NOT NULL,
	technique_id VARCHAR(100),
	setup TEXT NOT NULL,
	is_active BOOLEAN NOT NULL,
	tried_at TIMESTAMP WITH TIME ZONE,
	helped BOOLEAN,
	outcome_note TEXT,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE CASCADE
);

CREATE TABLE rewards (
	id VARCHAR(36) NOT NULL,
	habit_id VARCHAR(36) NOT NULL,
	name VARCHAR(160) NOT NULL,
	detail VARCHAR(300),
	is_active BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(habit_id) REFERENCES habits (id) ON DELETE CASCADE
);

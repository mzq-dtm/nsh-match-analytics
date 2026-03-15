CREATE TABLE guilds (
  guild_id     INTEGER PRIMARY KEY,
  guild_name   VARCHAR(100) NOT NULL
);
CREATE TABLE players (
  player_id    INTEGER PRIMARY KEY,
  created_at   TIMESTAMP NOT NULL
);
CREATE TABLE nickname_history (
  player_id   INTEGER REFERENCES players(player_id),
  nickname    VARCHAR(64) NOT NULL,          
  valid_from  TIMESTAMP   NOT NULL,           
  valid_to    TIMESTAMP   NULL,               
  PRIMARY KEY (player_id, valid_from)
);
CREATE TABLE professions (
  profession_id   INTEGER PRIMARY KEY,
  profession_name VARCHAR(50) NOT NULL
);
CREATE TABLE matches (
    match_id   INTEGER PRIMARY KEY,
    match_name TEXT    NOT NULL,
    match_time TIMESTAMP NOT NULL
);
CREATE TABLE match_performance (
  match_id              INTEGER NOT NULL REFERENCES matches(match_id),
  player_id             INTEGER NOT NULL REFERENCES players(player_id),
  guild_id              INTEGER NOT NULL REFERENCES guilds(guild_id),
  level                 INTEGER NOT NULL,
  profession_id         INTEGER NOT NULL REFERENCES professions(profession_id),
  leader_id             INTEGER NOT NULL REFERENCES players(player_id),
  kills                 INTEGER DEFAULT 0,
  assists               INTEGER DEFAULT 0,
  war_resources         INTEGER DEFAULT 0,
  damage_to_players     INTEGER DEFAULT 0,
  damage_to_structures  INTEGER DEFAULT 0,
  healing_amount        INTEGER DEFAULT 0,
  damage_taken          INTEGER DEFAULT 0,
  serious_injuries      INTEGER DEFAULT 0,
  skill_qingdeng        INTEGER DEFAULT 0,
  skill_huayu           INTEGER DEFAULT 0,
  control_count         INTEGER DEFAULT 0,
  recorded_nick         VARCHAR(64) NOT NULL,
  equipment_score       INTEGER NULL,
  skill_score           INTEGER NULL,
  cultivation_score     INTEGER NULL,
  total_combat_power    BIGINT NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX idx_match_performance_guild_id ON match_performance (guild_id);
CREATE INDEX idx_match_performance_profession_id ON match_performance (profession_id);
CREATE INDEX idx_match_performance_leader_id ON match_performance (leader_id);
CREATE TABLE match_results (
  match_id        INTEGER PRIMARY KEY
                  REFERENCES matches(match_id) ON DELETE CASCADE,
  home_guild_id   INTEGER NOT NULL
                  REFERENCES guilds(guild_id),
  away_guild_id   INTEGER NOT NULL
                  REFERENCES guilds(guild_id),
  home_outcome    TEXT
                  CHECK (home_outcome IN ('win', 'lose') OR home_outcome IS NULL),
  note            TEXT,
  CHECK (home_guild_id <> away_guild_id)
);
CREATE TABLE opponent_match_performance (
  opponent_perf_id       INTEGER PRIMARY KEY,
  match_id               INTEGER NOT NULL
                         REFERENCES matches(match_id) ON DELETE CASCADE,
  guild_id               INTEGER
                         REFERENCES guilds(guild_id),
  recorded_nick          VARCHAR(64) NOT NULL,
  level                  INTEGER,
  profession_id          INTEGER
                         REFERENCES professions(profession_id),
  leader_nick            VARCHAR(64),
  kills                  INTEGER,
  assists                INTEGER,
  war_resources          INTEGER,
  damage_to_players      INTEGER,
  damage_to_structures   INTEGER,
  healing_amount         INTEGER,
  damage_taken           INTEGER,
  serious_injuries       INTEGER,
  skill_qingdeng         INTEGER,
  skill_huayu            INTEGER,
  control_count          INTEGER
);
CREATE INDEX idx_opp_perf_match ON opponent_match_performance(match_id);
CREATE INDEX idx_opp_perf_guild ON opponent_match_performance(guild_id);
CREATE INDEX idx_opp_perf_profession ON opponent_match_performance(profession_id);

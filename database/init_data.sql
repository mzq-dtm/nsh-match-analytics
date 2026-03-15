BEGIN TRANSACTION;

-- players 基础记录
INSERT OR IGNORE INTO players (player_id, created_at)
VALUES (0, '2016-01-01 00:00:00');

-- nickname_history 基础记录
INSERT OR IGNORE INTO nickname_history (player_id, nickname, valid_from, valid_to)
VALUES (0, '无', '2016-01-01 00:00:00', NULL);

-- guilds 基础数据（guild_id为10000的占位帮会，小于10000号帮会的id留给本帮帮会名，大于10000号的帮会id留给对手帮会）
INSERT OR IGNORE INTO guilds (guild_id, guild_name)
VALUES (10000,'无');

-- professions 基础数据
INSERT OR IGNORE INTO professions (profession_id, profession_name) VALUES
(2001,'血河'),
(2002,'铁衣'),
(2003,'素问'),
(2004,'九灵'),
(2005,'神相'),
(2006,'碎梦'),
(2007,'龙吟'),
(2008,'玄机'),
(2009,'鸿音'),
(2010,'荒羽'),
(2011,'潮光'),
(2012,'沧澜'),
(2013,'云瑶');

COMMIT;
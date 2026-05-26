-- ============================================================
  -- Solo Spire — Supabase Migration
  -- Generated: 2026-05-26T15:38:00.545Z
  -- Run this entire script in Supabase > SQL Editor
  -- ============================================================

  -- Sequences
  CREATE SEQUENCE IF NOT EXISTS campaigns_id_seq START WITH 100;
  CREATE SEQUENCE IF NOT EXISTS characters_id_seq START WITH 100;
  CREATE SEQUENCE IF NOT EXISTS chat_messages_id_seq START WITH 100;
  CREATE SEQUENCE IF NOT EXISTS inventory_items_id_seq START WITH 100;
  CREATE SEQUENCE IF NOT EXISTS quests_id_seq START WITH 100;

  CREATE TABLE IF NOT EXISTS campaigns (
    id integer DEFAULT nextval('campaigns_id_seq') PRIMARY KEY,
    name text NOT NULL,
    current_scene text,
    current_location text,
    xp integer DEFAULT 0,
    level integer DEFAULT 1,
    gold integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_played_at timestamptz,
    user_id text NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id integer DEFAULT nextval('characters_id_seq') PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name text NOT NULL,
    race text NOT NULL,
    class text NOT NULL,
    background text NOT NULL,
    alignment text,
    backstory text,
    level integer DEFAULT 1,
    xp integer DEFAULT 0,
    hp integer DEFAULT 10,
    max_hp integer DEFAULT 10,
    temp_hp integer DEFAULT 0,
    ac integer DEFAULT 10,
    speed integer DEFAULT 30,
    proficiency_bonus integer DEFAULT 2,
    strength integer DEFAULT 10,
    dexterity integer DEFAULT 10,
    constitution integer DEFAULT 10,
    intelligence integer DEFAULT 10,
    wisdom integer DEFAULT 10,
    charisma integer DEFAULT 10,
    skill_proficiencies jsonb DEFAULT '[]',
    saving_throw_proficiencies jsonb DEFAULT '[]',
    spell_slots jsonb,
    spell_slots_used jsonb,
    known_spells jsonb DEFAULT '[]',
    features jsonb DEFAULT '[]',
    portrait_url text,
    portrait_description text,
    death_saves jsonb,
    conditions jsonb DEFAULT '[]',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    pact_boon text,
    invocations jsonb DEFAULT '[]',
    familiar jsonb,
    companion jsonb,
    subclass text,
    class_resources jsonb DEFAULT '[]',
    metamagic jsonb DEFAULT '[]',
    subclass_features jsonb DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id integer DEFAULT nextval('chat_messages_id_seq') PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    dice_rolls jsonb,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS inventory_items (
    id integer DEFAULT nextval('inventory_items_id_seq') PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    quantity integer DEFAULT 1,
    weight real,
    is_equipped boolean DEFAULT false,
    item_type text DEFAULT 'misc',
    created_at timestamptz DEFAULT now(),
    item_properties jsonb
  );

  CREATE TABLE IF NOT EXISTS quests (
    id integer DEFAULT nextval('quests_id_seq') PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    status text DEFAULT 'active',
    is_main boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  
-- DATA: campaigns
INSERT INTO campaigns (id,name,current_scene,current_location,xp,level,gold,created_at,updated_at,last_played_at,user_id) VALUES (4,'Haunted Highlands',NULL,NULL,0,1,0,'2026-05-02 00:08:45.401789+00','2026-05-02 00:08:45.401789+00',NULL,'user_3D93G1Up9rriQALC2BLH8gEvTNp');
INSERT INTO campaigns (id,name,current_scene,current_location,xp,level,gold,created_at,updated_at,last_played_at,user_id) VALUES (5,'Test Campaign Diag',NULL,NULL,0,1,0,'2026-05-02 00:25:02.962892+00','2026-05-02 00:25:26.666+00','2026-05-02 00:25:26.666+00','user_3D95PSiH4OGgkAGvofz3iZguyeC');
INSERT INTO campaigns (id,name,current_scene,current_location,xp,level,gold,created_at,updated_at,last_played_at,user_id) VALUES (6,'The Unnamed Quest',NULL,NULL,0,1,0,'2026-05-02 01:10:43.084549+00','2026-05-02 01:10:43.084549+00',NULL,'user_3D9As0Ww2U3KaWuGWw0zuBU1vna');
INSERT INTO campaigns (id,name,current_scene,current_location,xp,level,gold,created_at,updated_at,last_played_at,user_id) VALUES (7,'Spell Test Campaign',NULL,NULL,300,1,0,'2026-05-02 01:46:58.665032+00','2026-05-02 01:47:25.318+00','2026-05-02 01:47:25.318+00','user_3D9FKzzhTxgJOYphu5aL8DD63qK');

-- DATA: characters
INSERT INTO characters (id,campaign_id,name,race,class,background,alignment,backstory,level,xp,hp,max_hp,temp_hp,ac,speed,proficiency_bonus,strength,dexterity,constitution,intelligence,wisdom,charisma,skill_proficiencies,saving_throw_proficiencies,spell_slots,spell_slots_used,known_spells,features,portrait_url,portrait_description,death_saves,conditions,created_at,updated_at,pact_boon,invocations,familiar,companion,subclass,class_resources,metamagic,subclass_features) VALUES (3,4,'Kira Stormborne','Elf','Wizard','Folk Hero','True Neutral',NULL,1,0,5,5,0,9,30,2,8,8,8,8,8,8,'["Arcana", "History"]','["Intelligence", "Wisdom"]','{"1": 2}','{"1": 0}','["Fire Bolt", "Mage Hand", "Minor Illusion", "Magic Missile", "Shield", "Sleep", "Burning Hands", "Thunderwave", "Detect Magic"]','[]',NULL,NULL,NULL,'[]','2026-05-02 00:08:45.456856+00','2026-05-02 00:08:45.456856+00',NULL,'[]',NULL,NULL,NULL,'[]','[]','[]');
INSERT INTO characters (id,campaign_id,name,race,class,background,alignment,backstory,level,xp,hp,max_hp,temp_hp,ac,speed,proficiency_bonus,strength,dexterity,constitution,intelligence,wisdom,charisma,skill_proficiencies,saving_throw_proficiencies,spell_slots,spell_slots_used,known_spells,features,portrait_url,portrait_description,death_saves,conditions,created_at,updated_at,pact_boon,invocations,familiar,companion,subclass,class_resources,metamagic,subclass_features) VALUES (4,5,'Aldric','Dwarf','Fighter','Folk Hero','True Neutral',NULL,1,0,10,10,0,18,30,2,8,8,10,8,9,8,'["Athletics", "Perception"]','["Strength", "Constitution"]',NULL,NULL,'[]','[]',NULL,NULL,NULL,'[]','2026-05-02 00:25:03.017719+00','2026-05-02 00:25:03.017719+00',NULL,'[]',NULL,NULL,NULL,'[]','[]','[]');
INSERT INTO characters (id,campaign_id,name,race,class,background,alignment,backstory,level,xp,hp,max_hp,temp_hp,ac,speed,proficiency_bonus,strength,dexterity,constitution,intelligence,wisdom,charisma,skill_proficiencies,saving_throw_proficiencies,spell_slots,spell_slots_used,known_spells,features,portrait_url,portrait_description,death_saves,conditions,created_at,updated_at,pact_boon,invocations,familiar,companion,subclass,class_resources,metamagic,subclass_features) VALUES (5,6,'The Nameless One','Human','Warlock','Folk Hero','True Neutral',NULL,1,0,7,7,0,10,30,2,11,9,9,9,9,9,'["Arcana", "Deception"]','["Wisdom", "Charisma"]','{"1": 1}','{"1": 0}','[]','["The Fiend"]',NULL,NULL,NULL,'[]','2026-05-02 01:10:43.274164+00','2026-05-02 01:11:11.013+00',NULL,'[]',NULL,NULL,NULL,'[]','[]','[]');
INSERT INTO characters (id,campaign_id,name,race,class,background,alignment,backstory,level,xp,hp,max_hp,temp_hp,ac,speed,proficiency_bonus,strength,dexterity,constitution,intelligence,wisdom,charisma,skill_proficiencies,saving_throw_proficiencies,spell_slots,spell_slots_used,known_spells,features,portrait_url,portrait_description,death_saves,conditions,created_at,updated_at,pact_boon,invocations,familiar,companion,subclass,class_resources,metamagic,subclass_features) VALUES (6,7,'Lyra','Human','Warlock','Folk Hero','True Neutral',NULL,2,300,11,11,0,10,30,2,9,9,9,9,9,9,'["Arcana", "Deception"]','["Wisdom", "Charisma"]','{"1": 2}','{"1": 0}','["Eldritch Blast", "Chill Touch", "Hex", "Hellish Rebuke", "Armor of Agathys"]','["The Fiend"]',NULL,NULL,NULL,'[]','2026-05-02 01:46:58.916812+00','2026-05-02 01:47:44.568+00',NULL,'[]',NULL,NULL,NULL,'[]','[]','[]');

-- DATA: chat_messages
INSERT INTO chat_messages (id,campaign_id,role,content,dice_rolls,created_at) VALUES (1,5,'user','I look around the area. What do I see?',NULL,'2026-05-02 00:25:15.997213+00');
INSERT INTO chat_messages (id,campaign_id,role,content,dice_rolls,created_at) VALUES (2,5,'assistant','# The Crossroads at Dusk

  The last light of day bleeds amber and violet across a sky heavy with the promise of rain. You stand at a weathered crossroads where four dirt paths meet, each cutting through a landscape of rolling moorland — heather and scrub grass rippling in the cool evening wind like a dark sea.

  A **moss-eaten signpost** leans at the center of the intersection, its carved letters worn but legible if you step close. Four arms point in four directions.

  To the **North**, a squat cluster of thatched rooftops and chimney smoke suggests a village perhaps a mile off. Warm orange light glows in distant windows — the smell of woodsmoke drifts faintly on the air.

  To the **East**, the moorland rises into dark, forested hills. Somewhere in that direction, a crow calls once and goes silent. The trees look old and close together.

  To the **South**, the road winds down toward what appears to be a stone bridge crossing a river. Beyond it, the land stretches flat and grey into mist. You can just hear the faint rush of water.

  To the **West**, the path deteriorates almost immediately into a rutted track, and you can make out the angular silhouette of a ruined structure against the dying sky — a tower, perhaps, or the shell of an old mill.

  At your **feet**, you notice something half-trampled in the mud: a torn piece of canvas sacking with dark stains along one edge. Fresh enough that the stains haven''t fully dried.

  The wind picks up, and somewhere on it — very faintly — you think you hear a voice.

  ---

  *What do you do?*',NULL,'2026-05-02 00:25:26.661607+00');
INSERT INTO chat_messages (id,campaign_id,role,content,dice_rolls,created_at) VALUES (3,7,'user','Please award me 300 XP so I can level up to level 2.',NULL,'2026-05-02 01:47:14.916303+00');
INSERT INTO chat_messages (id,campaign_id,role,content,dice_rolls,created_at) VALUES (4,7,'assistant','The air shimmers with a faint sulfurous warmth as something stirs in the dark corners of Lyra''s mind — a presence ancient and hungry, coiling with satisfaction. The pact is *working*. Power bleeds into her veins like hot iron, and for a moment she sees through the veil of the mundane world into something vast and terrible and full of *promise*.

  ---

  Welcome, Lyra. Your story begins now — and your patron has taken notice.

  Before we dive in, let''s set the scene: **Where does your adventure begin?** I have a few suggestions, or you can describe your own starting situation:

  1. **A crossroads at dusk** — You''ve just fled a village that feared your sudden, inexplicable powers. The road ahead splits three ways, and a lone crow watches you from a dead tree.

  2. **A crumbling city tavern** — The Ember & Ash Inn, in the merchant city of Veldrath. You''ve been scraping by reading fortunes, and tonight a hooded stranger slid a note across your table before vanishing.

  3. **A dungeon threshold** — You stand before the iron-banded door of a ruined manor''s cellar, hired by a desperate farmer to find his missing daughter. Something scratched the door from the *inside*.

  4. **Your own beginning** — Tell me where Lyra is and what she''s doing, and I''ll build the world around her.

  What calls to you?',NULL,'2026-05-02 01:47:25.295329+00');

-- DATA: inventory_items
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (1,4,'Quarterstaff',NULL,1,NULL,false,'weapon','2026-05-02 00:08:45.475242+00','{"damage": "1d6", "damageType": "bludgeoning", "versatileDamage": "1d8", "weaponProperties": ["versatile"]}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (2,4,'Spellbook',NULL,1,NULL,false,'tool','2026-05-02 00:08:45.493102+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (3,4,'Component Pouch',NULL,1,NULL,false,'tool','2026-05-02 00:08:45.510328+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (4,4,'Scholar''s Pack',NULL,1,NULL,false,'misc','2026-05-02 00:08:45.52644+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (5,5,'Chain Mail',NULL,1,NULL,true,'armor','2026-05-02 00:25:03.055675+00','{"acBase": 16, "armorType": "heavy", "stealthDisadvantage": true}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (6,5,'Shield',NULL,1,NULL,true,'armor','2026-05-02 00:25:03.083022+00','{"acBase": 0, "armorType": "shield"}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (7,5,'Longsword',NULL,1,NULL,false,'weapon','2026-05-02 00:25:03.114452+00','{"damage": "1d8", "damageType": "slashing", "versatileDamage": "1d10", "weaponProperties": ["versatile"]}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (8,5,'Light Crossbow',NULL,1,NULL,false,'weapon','2026-05-02 00:25:03.168269+00','{"damage": "1d8", "damageType": "piercing", "weaponProperties": ["ammunition", "loading"]}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (9,5,'Crossbow Bolts',NULL,20,NULL,false,'misc','2026-05-02 00:25:03.191215+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (10,6,'Light Crossbow',NULL,1,NULL,false,'weapon','2026-05-02 01:10:43.295707+00','{"damage": "1d8", "damageType": "piercing", "weaponProperties": ["ammunition", "loading"]}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (11,6,'Crossbow Bolts',NULL,20,NULL,false,'misc','2026-05-02 01:10:43.323955+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (12,6,'Leather Armor',NULL,1,NULL,true,'armor','2026-05-02 01:10:43.346287+00','{"acBase": 11, "armorType": "light"}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (13,6,'Component Pouch',NULL,1,NULL,false,'tool','2026-05-02 01:10:43.367256+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (14,6,'Scholar''s Pack',NULL,1,NULL,false,'misc','2026-05-02 01:10:43.387972+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (15,6,'Dagger',NULL,2,NULL,false,'weapon','2026-05-02 01:10:43.41595+00','{"damage": "1d4", "damageType": "piercing", "weaponProperties": ["finesse", "light", "thrown"]}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (16,7,'Light Crossbow',NULL,1,NULL,false,'weapon','2026-05-02 01:46:58.959464+00','{"damage": "1d8", "damageType": "piercing", "weaponProperties": ["ammunition", "loading"]}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (17,7,'Crossbow Bolts',NULL,20,NULL,false,'misc','2026-05-02 01:46:58.985998+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (18,7,'Leather Armor',NULL,1,NULL,true,'armor','2026-05-02 01:46:59.011019+00','{"acBase": 11, "armorType": "light"}');
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (19,7,'Component Pouch',NULL,1,NULL,false,'tool','2026-05-02 01:46:59.037079+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (20,7,'Scholar''s Pack',NULL,1,NULL,false,'misc','2026-05-02 01:46:59.065468+00',NULL);
INSERT INTO inventory_items (id,campaign_id,name,description,quantity,weight,is_equipped,item_type,created_at,item_properties) VALUES (21,7,'Dagger',NULL,2,NULL,false,'weapon','2026-05-02 01:46:59.094936+00','{"damage": "1d4", "damageType": "piercing", "weaponProperties": ["finesse", "light", "thrown"]}');

-- Reset sequences so next inserts don't conflict with existing IDs
  SELECT setval('campaigns_id_seq', (SELECT MAX(id) FROM campaigns) + 1);
  SELECT setval('characters_id_seq', (SELECT MAX(id) FROM characters) + 1);
  SELECT setval('chat_messages_id_seq', (SELECT MAX(id) FROM chat_messages) + 1);
  SELECT setval('inventory_items_id_seq', (SELECT MAX(id) FROM inventory_items) + 1);
  SELECT setval('quests_id_seq', 10);
  
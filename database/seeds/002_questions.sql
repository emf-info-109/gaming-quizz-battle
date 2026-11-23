-- =============================================================================
--  Seed 002 – 140 questions (20 par catégorie)
--  correct_index : 0 = answer_1, 1 = answer_2, 2 = answer_3, 3 = answer_4
--  Idempotent : chaque question est identifiée par son "code" (ex : MC-01).
--  Rejouer ce fichier met à jour les questions existantes sans créer de doublon.
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO questions (code, category_id, difficulty, prompt, answer_1, answer_2, answer_3, answer_4, correct_index) VALUES
-- -----------------------------------------------------------------------------
-- 1. Minecraft
-- -----------------------------------------------------------------------------
('MC-01', 1, 'easy',   'Quel mob explose lorsqu’il s’approche du joueur ?', 'Le Zombie', 'Le Creeper', 'L’Enderman', 'L’Araignée', 1),
('MC-02', 1, 'easy',   'Quel bloc faut-il fabriquer pour accéder à la grille de craft 3×3 ?', 'Un four', 'Un coffre', 'Une table de craft', 'Une enclume', 2),
('MC-03', 1, 'easy',   'Dans quelle dimension affronte-t-on l’Ender Dragon ?', 'L’End', 'Le Nether', 'L’Overworld', 'Le Deep Dark', 0),
('MC-04', 1, 'easy',   'Avec quel bloc construit-on le cadre d’un portail du Nether ?', 'La bedrock', 'La netherrack', 'La pierre taillée', 'L’obsidienne', 3),
('MC-05', 1, 'easy',   'Combien de blocs de terre peut-on empiler au maximum dans un seul emplacement d’inventaire ?', '16', '32', '64', '99', 2),
('MC-06', 1, 'easy',   'Quel animal peut-on apprivoiser en lui donnant des os ?', 'Le loup', 'Le chat', 'Le cheval', 'Le renard', 0),
('MC-07', 1, 'medium', 'Qui est le créateur original de Minecraft ?', 'Jens Bergensten', 'Markus « Notch » Persson', 'Gabe Newell', 'Hideo Kojima', 1),
('MC-08', 1, 'medium', 'Quelle pioche minimum faut-il pour récolter un minerai de diamant ?', 'Pioche en bois', 'Pioche en pierre', 'Pioche en or', 'Pioche en fer', 3),
('MC-09', 1, 'medium', 'Quel minerai donne la poudre utilisée pour créer des circuits ?', 'Le lapis-lazuli', 'Le quartz', 'La redstone', 'Le charbon', 2),
('MC-10', 1, 'medium', 'Quel objet permet de localiser un fort (stronghold) ?', 'Une boussole', 'L’œil de l’Ender', 'Une carte vierge', 'Une perle de l’Ender', 1),
('MC-11', 1, 'medium', 'Que se passe-t-il si l’on regarde un Enderman dans les yeux ?', 'Il devient hostile', 'Il s’enfuit', 'Il lâche un objet', 'Il devient apprivoisé', 0),
('MC-12', 1, 'medium', 'Quel mob lâche des bâtons de blaze ?', 'Le Ghast', 'Le cube de magma', 'Le Wither squelette', 'Le Blaze', 3),
('MC-13', 1, 'medium', 'Combien de lingots de fer faut-il pour fabriquer un seau ?', '2', '3', '4', '5', 1),
('MC-14', 1, 'medium', 'Quel bloc est indestructible en mode survie ?', 'L’obsidienne', 'La bedrock', 'Le bloc de netherite', 'L’ardoise des abîmes', 1),
('MC-15', 1, 'medium', 'Quel studio suédois a créé Minecraft ?', 'Rovio', 'DICE', 'Mojang', 'Paradox', 2),
('MC-16', 1, 'hard',   'Combien de blocs de fer faut-il, avec une citrouille, pour créer un golem de fer ?', '4', '3', '5', '6', 0),
('MC-17', 1, 'hard',   'En quelle année la version 1.0 de Minecraft est-elle officiellement sortie ?', '2009', '2010', '2013', '2011', 3),
('MC-18', 1, 'hard',   'Quel ingrédient ajouté à une potion étrange donne une potion de vision nocturne ?', 'Une pastèque scintillante', 'Une carotte dorée', 'De la poudre de blaze', 'Une larme de Ghast', 1),
('MC-19', 1, 'hard',   'Quel ingrédient transforme une potion de vision nocturne en potion d’invisibilité ?', 'De la poudre à canon', 'Une larme de Ghast', 'Un œil d’araignée fermenté', 'Du sucre', 2),
('MC-20', 1, 'hard',   'Que faut-il assembler pour invoquer le Wither ?', '4 blocs de sable des âmes et 3 crânes de Wither squelette', '4 blocs de fer et 1 citrouille', '3 obsidiennes et 1 œil de l’Ender', '4 blocs de neige et 2 citrouilles', 0),

-- -----------------------------------------------------------------------------
-- 2. League of Legends
-- -----------------------------------------------------------------------------
('LOL-01', 2, 'easy',   'Quel studio a développé League of Legends ?', 'Blizzard', 'Valve', 'Riot Games', 'Epic Games', 2),
('LOL-02', 2, 'easy',   'Comment s’appelle la carte du mode classique 5 contre 5 ?', 'La Faille de l’invocateur', 'L’Abîme hurlant', 'La Forêt torturée', 'Le Cristal Scar', 0),
('LOL-03', 2, 'easy',   'Quel bâtiment faut-il détruire pour remporter une partie ?', 'L’inhibiteur', 'Le Nexus', 'La tourelle centrale', 'La fontaine', 1),
('LOL-04', 2, 'easy',   'Quelle championne est accompagnée de son ours en peluche Tibbers ?', 'Lux', 'Jinx', 'Annie', 'Lulu', 2),
('LOL-05', 2, 'easy',   'Quel yordle pose des champignons empoisonnés sur la carte ?', 'Heimerdinger', 'Rumble', 'Poppy', 'Teemo', 3),
('LOL-06', 2, 'easy',   'Sur quelle plateforme la série animée Arcane a-t-elle été diffusée ?', 'Netflix', 'Disney+', 'Prime Video', 'Crunchyroll', 0),
('LOL-07', 2, 'easy',   'Quel sort d’invocateur permet de se téléporter instantanément sur une courte distance ?', 'Fantôme', 'Saut éclair', 'Téléportation', 'Purge', 1),
('LOL-08', 2, 'medium', 'Quel sort d’invocateur les junglers utilisent-ils pour achever les monstres neutres ?', 'Embrasement', 'Barrière', 'Châtiment', 'Fatigue', 2),
('LOL-09', 2, 'medium', 'Que signifie l’acronyme MOBA ?', 'Massive Online Battle Adventure', 'Multiplayer Online Battle Arena', 'Multi Objective Battle Area', 'Mobile Online Brawl Arena', 1),
('LOL-10', 2, 'medium', 'Que signifie ARAM ?', 'All Random All Mid', 'Arena Ranked All Maps', 'All Roles Are Mixed', 'Attack Rush And Move', 0),
('LOL-11', 2, 'medium', 'Que signifie l’abréviation « CS » dans League of Legends ?', 'Critical Strike', 'Champion Select', 'Creep Score', 'Combat Skill', 2),
('LOL-12', 2, 'medium', 'Dans la série Arcane, dans quelles villes vivent Vi et Jinx ?', 'Demacia et Noxus', 'Ionia et Shurima', 'Freljord et Targon', 'Piltover et Zaun', 3),
('LOL-13', 2, 'medium', 'Quelle championne est la sœur de Garen ?', 'Lux', 'Fiora', 'Quinn', 'Kayle', 0),
('LOL-14', 2, 'medium', 'Quelle championne est une renarde à neuf queues ?', 'Sona', 'Ahri', 'Xayah', 'Neeko', 1),
('LOL-15', 2, 'medium', 'Quelle ligue professionnelle regroupe les meilleures équipes européennes ?', 'LCK', 'LPL', 'LEC', 'LCS', 2),
('LOL-16', 2, 'hard',   'Quel monstre épique accorde le bonus « Main du Baron » ?', 'Le Héraut de la Faille', 'Le Dragon ancestral', 'Le Carapateur', 'Baron Nashor', 3),
('LOL-17', 2, 'hard',   'En quelle année League of Legends est-il sorti ?', '2007', '2009', '2011', '2013', 1),
('LOL-18', 2, 'hard',   'Quelle équipe a remporté le tout premier championnat du monde, en 2011 ?', 'Fnatic', 'SK Telecom T1', 'Team SoloMid', 'Moscow Five', 0),
('LOL-19', 2, 'hard',   'Avec quelle équipe le joueur Faker a-t-il remporté tous ses titres de champion du monde ?', 'Gen.G', 'Samsung Galaxy', 'T1 (SK Telecom T1)', 'G2 Esports', 2),
('LOL-20', 2, 'hard',   'Quel champion possède l’ultime « Requiem », qui frappe tous les champions ennemis où qu’ils soient ?', 'Xerath', 'Twisted Fate', 'Soraka', 'Karthus', 3),

-- -----------------------------------------------------------------------------
-- 3. Counter-Strike
-- -----------------------------------------------------------------------------
('CS-01', 3, 'easy',   'Quelles sont les deux équipes qui s’affrontent dans Counter-Strike ?', 'Rebelles et Empire', 'Terroristes et Antiterroristes', 'Alliés et Axe', 'Rouges et Bleus', 1),
('CS-02', 3, 'easy',   'Quel studio édite Counter-Strike 2 ?', 'Valve', 'Riot Games', 'Ubisoft', 'Activision', 0),
('CS-03', 3, 'easy',   'En mode désamorçage, quel est l’objectif principal des terroristes ?', 'Sauver des otages', 'Capturer un drapeau', 'Poser la bombe et la faire exploser', 'Escorter un VIP', 2),
('CS-04', 3, 'easy',   'Quel fusil de précision emblématique peut éliminer en une seule balle au torse ?', 'AK-47', 'M4A4', 'Desert Eagle', 'AWP', 3),
('CS-05', 3, 'easy',   'Quelle grenade aveugle temporairement les joueurs ?', 'La grenade fumigène', 'La grenade aveuglante (flashbang)', 'La grenade incendiaire', 'La grenade leurre', 1),
('CS-06', 3, 'easy',   'Combien de joueurs compte chaque équipe en match compétitif ?', '5', '4', '6', '8', 0),
('CS-07', 3, 'medium', 'Counter-Strike était à l’origine un mod de quel jeu ?', 'Quake', 'Doom', 'Half-Life', 'Unreal Tournament', 2),
('CS-08', 3, 'medium', 'Quel fusil d’assaut est réservé aux terroristes ?', 'M4A1-S', 'AK-47', 'FAMAS', 'AUG', 1),
('CS-09', 3, 'medium', 'Quel équipement permet aux antiterroristes de désamorcer la bombe plus rapidement ?', 'Le gilet pare-balles', 'Le Zeus x27', 'La grenade leurre', 'Le kit de désamorçage', 3),
('CS-10', 3, 'medium', 'Quelle grenade incendiaire est réservée aux terroristes ?', 'Le cocktail Molotov', 'La grenade incendiaire', 'La grenade explosive', 'La grenade aveuglante', 0),
('CS-11', 3, 'hard',   'Les cartes dont le nom commence par « cs_ » correspondent à quel mode de jeu ?', 'Désamorçage de bombe', 'Course aux armements', 'Sauvetage d’otages', 'Match à mort', 2),
('CS-12', 3, 'medium', 'Quelle carte se déroule dans un village italien ?', 'Nuke', 'Inferno', 'Overpass', 'Vertigo', 1),
('CS-13', 3, 'medium', 'Quelle carte se déroule dans une centrale nucléaire ?', 'Ancient', 'Mirage', 'Train', 'Nuke', 3),
('CS-14', 3, 'medium', 'Que signifie réaliser un « ace » ?', 'Gagner un round au couteau', 'Éliminer à soi seul les 5 adversaires d’un round', 'Désamorcer la bombe à la dernière seconde', 'Gagner un match sans perdre de round', 1),
('CS-15', 3, 'medium', 'Quel est le pistolet de départ des terroristes ?', 'Le Glock-18', 'L’USP-S', 'Le Desert Eagle', 'Le Five-SeveN', 0),
('CS-16', 3, 'medium', 'Que désigne un « eco round » ?', 'Un round bonus', 'Un round joué uniquement au couteau', 'Un round où l’équipe économise son argent en achetant peu', 'Le dernier round d’une mi-temps', 2),
('CS-17', 3, 'hard',   'En quelle année la première version du mod Counter-Strike a-t-elle été publiée ?', '1996', '1999', '2002', '2004', 1),
('CS-18', 3, 'hard',   'Qui sont les créateurs du mod original Counter-Strike ?', 'Gabe Newell et Mike Harrington', 'John Carmack et John Romero', 'Minh « Gooseman » Le et Jess Cliffe', 'Markus Persson et Jens Bergensten', 2),
('CS-19', 3, 'hard',   'Sur quelle carte trouve-t-on le célèbre passage « Banane » menant au site B ?', 'Dust2', 'Mirage', 'Cache', 'Inferno', 3),
('CS-20', 3, 'hard',   'Avec quelle équipe s1mple a-t-il remporté son premier Major, en 2021 ?', 'Natus Vincere', 'Astralis', 'FaZe Clan', 'Team Vitality', 0),

-- -----------------------------------------------------------------------------
-- 4. Fortnite
-- -----------------------------------------------------------------------------
('FN-01', 4, 'easy',   'Quel studio a développé Fortnite ?', 'Epic Games', 'Activision', 'Electronic Arts', 'Bungie', 0),
('FN-02', 4, 'easy',   'Combien de joueurs au maximum s’affrontent dans une partie Battle Royale classique ?', '50', '64', '100', '150', 2),
('FN-03', 4, 'easy',   'Comment s’appelle le phénomène qui réduit progressivement la zone de jeu ?', 'Le brouillard', 'La tempête', 'La marée', 'Le vortex', 1),
('FN-04', 4, 'easy',   'D’où sautent les joueurs au début d’une partie ?', 'D’un avion cargo', 'D’une montgolfière', 'Du Bus de combat', 'D’un hélicoptère', 2),
('FN-05', 4, 'easy',   'Quelle est la monnaie virtuelle de Fortnite ?', 'Les gemmes', 'Les crédits', 'Les pièces d’or', 'Les V-bucks', 3),
('FN-06', 4, 'easy',   'Quels sont les trois matériaux de construction ?', 'Bois, pierre et métal', 'Bois, verre et métal', 'Terre, pierre et fer', 'Bois, brique et acier', 0),
('FN-07', 4, 'easy',   'Comment appelle-t-on la victoire en Battle Royale ?', 'Le Grand Chelem', 'La Victoire royale', 'Le Dernier Debout', 'Le Triomphe', 1),
('FN-08', 4, 'medium', 'Quel est le nom du mode coopératif d’origine où l’on combat des monstres ?', 'Sauver le monde', 'Créatif', 'Arène', 'Zone de guerre', 0),
('FN-09', 4, 'medium', 'En quelle année le mode Battle Royale de Fortnite est-il sorti ?', '2015', '2016', '2017', '2019', 2),
('FN-10', 4, 'medium', 'Quel moteur graphique fait tourner Fortnite ?', 'Unity', 'Unreal Engine', 'Frostbite', 'Source', 1),
('FN-11', 4, 'medium', 'Quel lieu emblématique du Chapitre 1 était célèbre pour ses nombreux immeubles ?', 'Lazy Links', 'Pleasant Park', 'Tilted Towers', 'Retail Row', 2),
('FN-12', 4, 'medium', 'Quelles sont les quatre pièces de construction de base ?', 'Mur, porte, fenêtre et toit', 'Sol, escalier, pont et tour', 'Mur, sol, colonne et dôme', 'Mur, sol, rampe et toit', 3),
('FN-13', 4, 'medium', 'Comment s’appelle le personnage banane devenu une mascotte du jeu ?', 'Peely', 'Bananor', 'Fishstick', 'Jonesy', 0),
('FN-14', 4, 'medium', 'Combien de points de bouclier donne une grande potion de bouclier ?', '25', '50', '75', '100', 1),
('FN-15', 4, 'hard',   'Quel rappeur a donné un concert virtuel géant dans Fortnite en avril 2020 ?', 'Drake', 'Eminem', 'Travis Scott', 'Kanye West', 2),
('FN-16', 4, 'easy',   'Comment s’appellent les animations de danse que l’on peut effectuer en jeu ?', 'Les gestes', 'Les emotes', 'Les poses', 'Les combos', 1),
('FN-17', 4, 'hard',   'Quel événement d’octobre 2019 a englouti toute la carte dans un trou noir ?', 'Le Cube', 'Galactus', 'The End', 'Le Déluge', 2),
('FN-18', 4, 'hard',   'Quel joueur a remporté la Coupe du monde Fortnite en solo en 2019 ?', 'Ninja', 'Tfue', 'Mongraal', 'Bugha', 3),
('FN-19', 4, 'hard',   'Quelle somme Bugha a-t-il remportée lors de cette Coupe du monde 2019 ?', '500 000 $', '1 million $', '3 millions $', '10 millions $', 2),
('FN-20', 4, 'hard',   'Quel objet en forme de lama contient des ressources et des munitions ?', 'Le lama doré', 'Le lama de ravitaillement', 'Le lama arc-en-ciel', 'La piñata royale', 1),

-- -----------------------------------------------------------------------------
-- 5. Pokémon
-- -----------------------------------------------------------------------------
('PK-01', 5, 'easy',   'Quel Pokémon porte le numéro 25 du Pokédex national ?', 'Pichu', 'Raichu', 'Pikachu', 'Évoli', 2),
('PK-02', 5, 'easy',   'Quel est le Pokémon de départ de type Feu dans Pokémon Rouge et Bleu ?', 'Salamèche', 'Bulbizarre', 'Carapuce', 'Ponyta', 0),
('PK-03', 5, 'easy',   'Lequel de ces types est super efficace contre le type Eau ?', 'Feu', 'Sol', 'Roche', 'Plante', 3),
('PK-04', 5, 'easy',   'En quel Pokémon évolue Salamèche ?', 'Dracaufeu', 'Reptincel', 'Feunard', 'Arcanin', 1),
('PK-05', 5, 'easy',   'Comment s’appelle l’équipe de méchants de Jessie et James ?', 'Team Magma', 'Team Aqua', 'Team Rocket', 'Team Galaxie', 2),
('PK-06', 5, 'easy',   'Quelle Poké Ball capture à coup sûr n’importe quel Pokémon ?', 'Hyper Ball', 'Master Ball', 'Super Ball', 'Luxe Ball', 1),
('PK-07', 5, 'easy',   'En quel Pokémon évolue Magicarpe ?', 'Léviator', 'Lokhlass', 'Tentacruel', 'Hypocéan', 0),
('PK-08', 5, 'medium', 'Quel Pokémon légendaire porte le numéro 150 ?', 'Mew', 'Mewtwo', 'Artikodin', 'Lugia', 1),
('PK-09', 5, 'medium', 'Combien de Pokémon compte le Pokédex de la première génération ?', '100', '150', '151', '251', 2),
('PK-10', 5, 'medium', 'Quelle pierre fait évoluer Évoli en Aquali ?', 'Pierre Lune', 'Pierre Feu', 'Pierre Plante', 'Pierre Eau', 3),
('PK-11', 5, 'medium', 'Comment s’appelle le professeur de Pokémon Rouge et Bleu ?', 'Professeur Orme', 'Professeur Seko', 'Professeur Chen', 'Professeur Platane', 2),
('PK-12', 5, 'medium', 'Dans quelle région se déroulent Pokémon Rouge et Bleu ?', 'Johto', 'Kanto', 'Hoenn', 'Sinnoh', 1),
('PK-13', 5, 'medium', 'Quel type est totalement insensible aux attaques de type Normal ?', 'Spectre', 'Roche', 'Acier', 'Psy', 0),
('PK-14', 5, 'medium', 'Quel Pokémon endormi bloque la route et doit être réveillé avec la Pokéflûte ?', 'Lokhlass', 'Ronflex', 'Grolem', 'Kangourex', 1),
('PK-15', 5, 'medium', 'Quel Pokémon porte le numéro 1 du Pokédex national ?', 'Pikachu', 'Mew', 'Bulbizarre', 'Arceus', 2),
('PK-16', 5, 'hard',   'Quels sont les types de Dracaufeu ?', 'Feu / Dragon', 'Feu seulement', 'Feu / Combat', 'Feu / Vol', 3),
('PK-17', 5, 'hard',   'Quel type a été introduit avec Pokémon X et Y ?', 'Ténèbres', 'Acier', 'Fée', 'Dragon', 2),
('PK-18', 5, 'hard',   'Quels types ont été ajoutés en deuxième génération (Or et Argent) ?', 'Acier et Ténèbres', 'Fée et Dragon', 'Spectre et Psy', 'Glace et Insecte', 0),
('PK-19', 5, 'hard',   'Quel studio développe les jeux Pokémon principaux ?', 'Intelligent Systems', 'HAL Laboratory', 'Retro Studios', 'Game Freak', 3),
('PK-20', 5, 'hard',   'En quelle année les premiers jeux Pokémon sont-ils sortis au Japon ?', '1994', '1996', '1998', '2000', 1),

-- -----------------------------------------------------------------------------
-- 6. World of Warcraft
-- -----------------------------------------------------------------------------
('WOW-01', 6, 'easy',   'Quel studio a créé World of Warcraft ?', 'Bethesda', 'Blizzard Entertainment', 'BioWare', 'Square Enix', 1),
('WOW-02', 6, 'easy',   'Quelles sont les deux grandes factions jouables ?', 'L’Alliance et la Horde', 'Les Elfes et les Orcs', 'L’Empire et la Rébellion', 'Le Fléau et la Légion', 0),
('WOW-03', 6, 'easy',   'Sur quel monde se déroule World of Warcraft ?', 'Tamriel', 'Sanctuaire', 'Azeroth', 'Hyrule', 2),
('WOW-04', 6, 'easy',   'Quelle extension a introduit les Pandarens comme race jouable ?', 'Cataclysm', 'Legion', 'Warlords of Draenor', 'Mists of Pandaria', 3),
('WOW-05', 6, 'easy',   'Quel est le rôle principal d’un « tank » en donjon ?', 'Soigner le groupe', 'Infliger un maximum de dégâts à distance', 'Encaisser les coups et retenir l’attention des ennemis', 'Ouvrir les coffres', 2),
('WOW-06', 6, 'easy',   'Dans quelle extension affronte-t-on le Roi-liche ?', 'Wrath of the Lich King', 'The Burning Crusade', 'Shadowlands', 'Dragonflight', 0),
('WOW-07', 6, 'medium', 'En quelle année World of Warcraft est-il sorti en Amérique du Nord ?', '2002', '2004', '2006', '2008', 1),
('WOW-08', 6, 'medium', 'Quelle est la capitale des humains de l’Alliance ?', 'Forgefer', 'Darnassus', 'Hurlevent', 'Lune-d’argent', 2),
('WOW-09', 6, 'medium', 'Quelle est la capitale des orcs de la Horde ?', 'Orgrimmar', 'Fossoyeuse', 'Les Pitons-du-Tonnerre', 'Hurlevent', 0),
('WOW-10', 6, 'medium', 'Quelle a été la première extension de World of Warcraft ?', 'Wrath of the Lich King', 'Cataclysm', 'Mists of Pandaria', 'The Burning Crusade', 3),
('WOW-11', 6, 'medium', 'Quel était le nom du Roi-liche avant sa chute, lorsqu’il était prince de Lordaeron ?', 'Anduin Wrynn', 'Arthas Menethil', 'Varian Wrynn', 'Uther le Porteur de Lumière', 1),
('WOW-12', 6, 'medium', 'Quelle classe héroïque est apparue avec Wrath of the Lich King ?', 'Le moine', 'Le chasseur de démons', 'Le chevalier de la mort', 'L’évocateur', 2),
('WOW-13', 6, 'medium', 'Quel était le niveau maximum dans la version originale du jeu ?', '50', '60', '70', '80', 1),
('WOW-14', 6, 'medium', 'Quel objet permet de se téléporter vers son auberge ?', 'Le parchemin de rappel', 'L’orbe de transfert', 'La rune de retour', 'La pierre de foyer', 3),
('WOW-15', 6, 'medium', 'Quel joueur est devenu célèbre en fonçant seul dans une salle pleine de dragonnets ?', 'Leeroy Jenkins', 'Thrall', 'Grubby', 'Ninja', 0),
('WOW-16', 6, 'hard',   'Quel antagoniste de Cataclysm est un immense dragon noir ?', 'Alexstrasza', 'Aile de mort', 'Malygos', 'Nozdormu', 1),
('WOW-17', 6, 'hard',   'Quelle classe a été introduite avec l’extension Legion ?', 'Le chevalier de la mort', 'Le moine', 'Le chasseur de démons', 'Le druide', 2),
('WOW-18', 6, 'hard',   'Dans quel raid de 40 joueurs affrontait-on Ragnaros dans le jeu original ?', 'Le Cœur du Magma', 'Naxxramas', 'Le repaire d’Onyxia', 'Le temple d’Ahn’Qiraj', 0),
('WOW-19', 6, 'hard',   'Quel titan déchu dirige la Légion ardente ?', 'Kil’jaeden', 'Archimonde', 'Sargeras', 'Illidan', 2),
('WOW-20', 6, 'hard',   'Quel chef de guerre orc dirigeait la Horde au lancement du jeu ?', 'Garrosh Hurlenfer', 'Thrall', 'Vol’jin', 'Sylvanas Coursevent', 1),

-- -----------------------------------------------------------------------------
-- 7. Culture gaming générale
-- -----------------------------------------------------------------------------
('GC-01', 7, 'easy',   'Quel plombier moustachu est la mascotte de Nintendo ?', 'Wario', 'Luigi', 'Mario', 'Toad', 2),
('GC-02', 7, 'easy',   'Quel hérisson bleu est la mascotte de SEGA ?', 'Sonic', 'Knuckles', 'Shadow', 'Tails', 0),
('GC-03', 7, 'easy',   'Quelle entreprise fabrique les consoles Xbox ?', 'Sony', 'Microsoft', 'Nintendo', 'Valve', 1),
('GC-04', 7, 'easy',   'Que signifie l’abréviation « PNJ » ?', 'Point de nouveau joueur', 'Partie non jouable', 'Pouvoir de niveau junior', 'Personnage non joueur', 3),
('GC-05', 7, 'easy',   'Dans quelle série incarne-t-on Link ?', 'Final Fantasy', 'The Legend of Zelda', 'Dragon Quest', 'Metroid', 1),
('GC-06', 7, 'easy',   'Quelle plateforme de distribution de jeux PC appartient à Valve ?', 'Steam', 'Origin', 'Uplay', 'GOG', 0),
('GC-07', 7, 'easy',   'Quel personnage est l’ennemi juré de Mario ?', 'Ganondorf', 'Dr. Eggman', 'King K. Rool', 'Bowser', 3),
('GC-08', 7, 'medium', 'Quel jeu de tennis de table de 1972 est l’un des premiers grands succès de l’arcade ?', 'Pong', 'Space Invaders', 'Pac-Man', 'Asteroids', 0),
('GC-09', 7, 'medium', 'Quel jeu de blocs qui tombent a été créé par Alexeï Pajitnov ?', 'Columns', 'Puyo Puyo', 'Tetris', 'Dr. Mario', 2),
('GC-10', 7, 'medium', 'Quelle console portable de Nintendo, sortie en 1989, était souvent vendue avec Tetris ?', 'Game Gear', 'Game Boy', 'Nintendo DS', 'Lynx', 1),
('GC-11', 7, 'medium', 'Quel est le jeu vidéo le plus vendu de tous les temps ?', 'Tetris (version Game Boy)', 'GTA V', 'Wii Sports', 'Minecraft', 3),
('GC-12', 7, 'medium', 'Quel studio polonais a développé The Witcher 3 ?', 'CD Projekt Red', 'Techland', 'People Can Fly', '11 bit studios', 0),
('GC-13', 7, 'medium', 'Dans quel pays la société Ubisoft a-t-elle été fondée ?', 'Canada', 'Belgique', 'France', 'Suisse', 2),
('GC-14', 7, 'medium', 'Que signifie l’abréviation FPS lorsqu’elle désigne un genre de jeu ?', 'Fast Play Session', 'First-Person Shooter', 'Frames Per Second', 'Final Player Standing', 1),
('GC-15', 7, 'medium', 'Quel personnage est le héros de la série God of War ?', 'Kratos', 'Dante', 'Marcus Fenix', 'Master Chief', 0),
('GC-16', 7, 'hard',   'En quelle année la Nintendo Switch est-elle sortie ?', '2015', '2016', '2017', '2019', 2),
('GC-17', 7, 'hard',   'Quel jeu d’id Software sorti en 1993 a popularisé le jeu de tir à la première personne ?', 'Wolfenstein 3D', 'Quake', 'Duke Nukem 3D', 'Doom', 3),
('GC-18', 7, 'hard',   'Quel créateur japonais est à l’origine de Mario et de Zelda ?', 'Hideo Kojima', 'Shigeru Miyamoto', 'Satoshi Tajiri', 'Hironobu Sakaguchi', 1),
('GC-19', 7, 'hard',   'Quel jeu indépendant de 2015 a été créé par Toby Fox ?', 'Undertale', 'Celeste', 'Hollow Knight', 'Stardew Valley', 0),
('GC-20', 7, 'hard',   'Comment s’appelle le fantôme rouge qui poursuit Pac-Man ?', 'Inky', 'Pinky', 'Clyde', 'Blinky', 3)
AS new
ON DUPLICATE KEY UPDATE
  category_id   = new.category_id,
  difficulty    = new.difficulty,
  prompt        = new.prompt,
  answer_1      = new.answer_1,
  answer_2      = new.answer_2,
  answer_3      = new.answer_3,
  answer_4      = new.answer_4,
  correct_index = new.correct_index;

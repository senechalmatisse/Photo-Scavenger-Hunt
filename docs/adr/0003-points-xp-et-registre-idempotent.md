# ADR 0003 — Points de classement et XP séparés, registre des récompenses idempotent

- Statut : acceptée
- Date : 2026-11-01

## Contexte

Le barème du cahier des charges est indicatif et « à équilibrer après les premiers tests ». Il distingue les points (compétition entre joueurs) de l'expérience (progression personnelle, niveaux). Il faut éviter qu'un joueur accumule des points en rejouant un défi déjà résolu, récompenser la régularité (série de défis quotidiens) et ne jamais attribuer deux fois les gains d'une même partie.

## Décision

- Le score d'une partie est calculé par `ScoringPolicy`, une suite ordonnée de `ScoreRule` : points du   défi, bonus sans indice, bonus de rapidité, coût des indices, bonus du défi quotidien, puis annulation pour une partie rejouée. Les montants viennent de la configuration (`SCORE_*`). Le détail ligne à ligne est enregistré avec la partie et affiché au joueur.
- L'XP est calculée séparément par `XpPolicy` : XP du défi en cas de réussite, XP de participation en cas d'échec, d'expiration ou de partie rejouée, rien en cas d'abandon.
- La progression réagit à `GameSessionFinished` et inscrit la partie dans `reward_ledger`, dont la clé primaire est l'identifiant de la partie, dans la **même transaction** que la mise à jour de `player_progress` (XP, niveau, série, badges). Un événement reçu deux fois ne rapporte rien la seconde fois.
- Les classements général, hebdomadaire (semaine ISO) et mensuel sont des ensembles triés Redis alimentés par le même événement.

## Conséquences

- Rééquilibrer le barème est une affaire de configuration, ou d'une nouvelle `ScoreRule`.
- Les gains d'une partie sont expliqués et vérifiables a posteriori.
- `reward_ledger` est la source de vérité des points (par joueur et journée de jeu) : les classements Redis sont une projection qui peut en être reconstruite. Le script de reconstruction reste à écrire.
- L'incrément Redis n'est pas encore idempotent. C'est sans effet avec la livraison actuelle des événements (une seule fois, ADR 0006), mais il faudra marquer chaque partie comptée (`SET NX`) avant de passer à une livraison « au moins une fois ».

## Options écartées

- **Un score unique pour tout** : mélange la compétition et la progression, et rend le rejeu rentable.
- **Classements calculés en SQL à chaque consultation** : simple, mais coût croissant avec le nombre de parties ; reste une solution de repli possible à partir de `reward_ledger`.

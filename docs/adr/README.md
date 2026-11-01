# Décisions d'architecture

Chaque décision structurante est consignée ici : son contexte, ce qui a été décidé, ce que cela implique et les options écartées. Une décision n'est jamais réécrite : si elle change, une nouvelle ADR la remplace et l'ancienne passe au statut « remplacée ».

| N° | Décision |
| --- | --- |
| [0001](0001-monolithe-modulaire-hexagonal.md) | Monolithe modulaire en architecture hexagonale |
| [0002](0002-validation-par-regles-composables.md) | Validation par règles composables et décisives |
| [0003](0003-points-xp-et-registre-idempotent.md) | Points de classement et XP séparés, registre des récompenses idempotent |
| [0004](0004-flickr-anti-corruption-et-licences.md) | Flickr derrière une couche anti-corruption, des décorateurs et une politique de licences |
| [0005](0005-persistance-sql-explicite.md) | Persistance en SQL explicite, migrations versionnées, sans clé étrangère entre modules |
| [0006](0006-evenements-de-domaine.md) | Événements de domaine en mémoire, évolution vers une boîte d'envoi |

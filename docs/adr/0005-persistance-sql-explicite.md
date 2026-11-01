# ADR 0005 — Persistance en SQL explicite, migrations versionnées, sans clé étrangère entre modules

- Statut : acceptée
- Date : 2026-11-01

## Contexte

La base est PostgreSQL avec PostGIS. L'équipe applique des normes d'écriture SQL (en-tête de script, mots-clés en majuscules, une colonne par ligne, ordres commentés, jointures dans la clause `WHERE`) et souhaite des scripts relisibles par un administrateur de base de données. Plusieurs instances du backend peuvent démarrer en même temps. Les modules doivent pouvoir être séparés plus tard (ADR 0001).

## Décision

- Accès par `node-postgres` et requêtes SQL écrites à la main, paramétrées, sans ORM. Chaque agrégat a son dépôt (patron Data Mapper) qui traduit entre lignes et objets du domaine.
- Les parties d'un agrégat toujours lues ensemble sont en JSONB (conditions figées, tentatives et score d'une partie, critères et zone d'un défi). La zone est aussi stockée en `GEOGRAPHY` avec un index GiST pour filtrer le catalogue par région.
- Verrouillage optimiste par colonne `version` : une écriture concurrente lève `ConcurrencyError` (HTTP 409). Les invariants d'unicité (une partie active par joueur et défi, un défi quotidien par joueur et jour) sont garantis par des index uniques partiels.
- Unité de travail par `AsyncLocalStorage` : les dépôts appelés dans `uow.run(...)` partagent la même transaction sans la recevoir en paramètre.
- Migrations `V###__description.sql` appliquées dans l'ordre au démarrage du conteneur, chacune dans sa transaction (arrêt au premier échec, équivalent de `WHENEVER SQLERROR EXIT 1`), sous verrou consultatif et avec contrôle d'empreinte des scripts déjà appliqués.
- Clés étrangères uniquement entre tables d'un même module. Les références entre modules sont des identifiants ; l'effacement d'un compte est propagé par l'événement `UserDeleted`, que chaque module traite pour ses propres données.

## Conséquences

- Les requêtes sont visibles, revues et optimisées comme du SQL ordinaire, selon les normes de l'équipe.
- Chaque module peut migrer vers son propre schéma ou sa propre base sans casser de contrainte.
- La base ne garantit pas l'intégrité entre modules : une réaction à `UserDeleted` en échec laisse des données orphelines, à détecter par un contrôle périodique (à écrire).
- Le code de correspondance entre lignes et objets est écrit à la main.

## Options écartées

- **ORM (TypeORM, Prisma)** : SQL généré difficile à relire et à aligner sur les normes, tentation de modèles anémiques et de chargements implicites entre modules.
- **Une table par élément des tentatives et des indices** : jointures systématiques pour des données toujours lues ensemble et jamais interrogées séparément.

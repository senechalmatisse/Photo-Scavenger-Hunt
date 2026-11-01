# ADR 0001 — Monolithe modulaire en architecture hexagonale

- Statut : acceptée
- Date : 2026-11-01

## Contexte

Le MVP doit être livré par une petite équipe, mais le cahier des charges annonce de nombreuses évolutions : nouveaux modes de jeu (exploration libre, multijoueur), nouveaux critères de validation, défis communautaires, autres sources de photos. La pile imposée est NestJS, PostgreSQL/PostGIS et Redis. Les règles du jeu (validation, barème, états d'une partie) sont le cœur de valeur et doivent être testables rapidement.

## Décision

- Un seul backend déployable, découpé en modules métier : `identity`, `photos`, `challenges`, `gameplay`, `progression`, `leaderboards`, `dashboard`.
- Dans chaque module, les couches `domain` → `application` → `infrastructure` / `presentation`. Le domaine et les cas d'usage sont du TypeScript pur ; Nest n'apparaît que dans les contrôleurs, les adaptateurs et le fichier `*.module.ts`, qui sert de racine de composition (fabriques `useCase`, jetons de ports).
- Entre modules : appels via le `public-api.ts` du module cible (façades, ports et types publiés) ou réaction à des événements de domaine (ADR 0006). Pas de clé étrangère entre tables de modules différents (ADR 0005).
- `src/testing/in-memory-app.ts` compose les mêmes cas d'usage sans framework pour les tests de scénario.

## Conséquences

- Les tests du domaine et des parcours complets s'exécutent en mémoire, sans base ni framework.
- Un module peut devenir un service séparé : ses dépendances entrantes sont déjà des appels de façade ou des événements.
- Plus de fichiers et de câblage qu'une application Nest classique (fabriques explicites, ports).
- La règle d'import n'est pas encore vérifiée automatiquement : ajouter un contrôle des frontières (dependency-cruiser ou eslint-plugin-boundaries) à l'intégration continue.

## Options écartées

- **Microservices dès le départ** : coût d'exploitation et cohérence distribuée injustifiés pour un MVP.
- **Services Nest injectables partout** : le métier dépendrait du framework et de l'ORM, et chaque test devrait monter un module Nest.

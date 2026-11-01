# Photo Scavenger Hunt

Jeu de missions photographiques sur les photos publiques de Flickr : le joueur lit une énigme, explore les photographies (planche contact ou carte), entoure la bonne vue et gagne des points.

| Couche | Technologie |
| --- | --- |
| Frontend | Angular 21 (composants autonomes, signaux, sans zone.js), Leaflet |
| Backend | NestJS 11, architecture hexagonale, TypeScript strict |
| Données | PostgreSQL 17 + PostGIS (SQL explicite, migrations versionnées), Redis (cache, classements) |
| Infra | Docker Compose, Traefik (HTTPS Let's Encrypt), nginx non privilégié |

## Démarrer

### 1. En local, sans Docker ni base de données

Le backend fonctionne entièrement en mémoire avec un catalogue de photos de démonstration :

```bash
cd backend && npm install && npm run start:dev      # API sur http://localhost:3000/api (docs : /api/docs)
cd frontend && npm install && npm start             # http://localhost:4200 (proxy /api → :3000)
```

Les valeurs par défaut hors production sont `PERSISTENCE_DRIVER=memory`, `PHOTO_PROVIDER=fixtures` et `SEED_DEMO=true` : six défis de démonstration sont publiés au démarrage. Créez `backend/.env` pour un compte administrateur (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### 2. Pile complète avec Docker

```bash
cp .env.example .env                                # renseigner POSTGRES_PASSWORD, JWT_SECRET, FLICKR_API_KEY
docker compose up -d --build
```

Application sur http://localhost:8080. Pour une démonstration sans clé Flickr : `PHOTO_PROVIDER=fixtures` et `SEED_DEMO=true` dans `.env`.

### 3. Production en HTTPS

```bash
# .env : DOMAIN=jeu.example.org, ACME_EMAIL=..., secrets de production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Le conteneur backend applique les migrations SQL au démarrage (`docker/entrypoint.sh`) puis lance l'API.

## Tests

```bash
cd backend && npm test                              # domaine, cas d'usage, adaptateur Flickr, scénarios complets
cd backend && npm run test:e2e                      # API HTTP complète (pilotes mémoire, aucun service externe)
cd frontend && npm test                             # Vitest
```

Après le premier `npm install`, versionnez les `package-lock.json` générés : les images Docker utiliseront alors `npm ci`.

## Organisation

```text
backend/
  database/migrations/        scripts SQL versionnés (V001__schema_initial.sql)
  docker/entrypoint.sh        migrations puis démarrage de l'API
  src/
    shared/                   noyau partagé : domaine (géo, dates, erreurs), ports, infrastructure
    modules/
      identity/               comptes, invités, JWT, rôles
      photos/                 port PhotoCatalog, adaptateur Flickr (ACL), cache, résilience, licences
      challenges/             agrégat Défi, règles de validation composables, défi du jour, administration
      gameplay/               agrégat Partie (machine à états), barème, modes de jeu
      progression/            XP, niveaux, séries, badges, registre des récompenses
      leaderboards/           classements général, hebdomadaire, mensuel (Redis)
      dashboard/              façade de lecture du tableau de bord
    testing/                  composition en mémoire et scénarios de bout en bout
frontend/src/app/
  core/                       clients API, authentification, intercepteurs, notifications
  shared/                     planche contact, carte, fiche photo, formats
  features/                   tableau de bord, défis, jeu, classements, profil, administration
docs/                         architecture, guide d'extension, décisions d'architecture (ADR)
```

Chaque module backend suit les couches `domain` → `application` → `infrastructure` / `presentation` ; les autres modules n'utilisent son code métier que via son fichier `public-api.ts`.
Voir [l'architecture](docs/architecture.md), [le guide d'extension](docs/extending.md) et [les décisions d'architecture](docs/adr/README.md).

## Flickr : obligations respectées

- Notice « This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc. » en pied de page.
- Chaque photo est affichée avec son auteur, sa licence et un lien vers sa page source.
- 30 photos au maximum par page de résultats ; cache de courte durée ; recherche `safe_search`.
- Licences filtrées par une politique configurable : « Tous droits réservés » n'est jamais proposé ;
  le profil `commercial` exclut aussi les licences NC.
- Vérification quotidienne des photos de référence : un défi dont la photo est supprimée, privée ou
  passée sous une licence non autorisée est désactivé automatiquement (jamais pendant une panne de Flickr).
- Une application commerciale doit obtenir une clé API commerciale auprès de SmugMug.

## Feuille de route

Les extensions prévues (exploration libre, géolocalisation, notifications, défis communautaires, multijoueur) s'ajoutent par les points d'extension décrits dans [docs/extending.md](docs/extending.md) sans modifier le cœur existant.

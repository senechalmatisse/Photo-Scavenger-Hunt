# ADR 0004 — Flickr derrière une couche anti-corruption, des décorateurs et une politique de licences

- Statut : acceptée
- Date : 2026-11-01

## Contexte

Le jeu repose sur les photos publiques de Flickr. Les conditions d'utilisation de l'API imposent d'afficher au plus 30 photos par page, de ne conserver les photos que pour une durée raisonnable, d'afficher la mention « This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc. » et d'obtenir une clé commerciale pour une application dont le but principal est de générer des revenus.
Flickr recommande de rester sous 3 600 requêtes par heure et par clé. Chaque photo a sa propre licence, et une photo peut disparaître ou changer de licence après la création d'un défi.

## Décision

- Le module `photos` définit le port `PhotoCatalog` et son modèle `Photo`. `FlickrPhotoCatalog` est l'unique endroit qui connaît le format Flickr (couche anti-corruption).
- Le catalogue est composé par décorateurs : cache (5 min pour les recherches, 1 h pour une photo, Redis), résilience (réessais à délai croissant sur les erreurs transitoires et disjoncteur), instrumentation (durée et échec de chaque appel), puis l'adaptateur Flickr ou le catalogue de démonstration hors ligne.
- `LicensePolicy` filtre toutes les photos proposées ou jugées : « Tous droits réservés » est toujours exclu ; le profil `commercial` exclut aussi les licences « pas d'utilisation commerciale » ; une liste explicite (`ALLOWED_LICENSES`) peut remplacer le profil.
- Les recherches sont limitées à 30 photos par page, avec `safe_search`, et ne portent que sur des photographies (ni captures d'écran ni illustrations).
- Une tâche quotidienne vérifie les photos de référence et désactive un défi dont la photo n'est plus disponible ou plus autorisée. Elle s'interrompt si Flickr est indisponible pour ne pas désactiver de défis à tort.
- Une panne de Flickr renvoie une erreur 503 explicite ; le reste du jeu (profil, classements, tableau de bord) continue de fonctionner.

## Conséquences

- Le domaine et le front ne dépendent pas de Flickr ; une autre source peut être ajoutée (docs/extending.md).
- Le cache réduit fortement le nombre d'appels, mais sa durée doit rester courte pour respecter les conditions d'utilisation.
- Le disjoncteur est local à chaque instance du backend ; avec plusieurs instances, son état pourra être partagé dans Redis.
- Une exploitation commerciale suppose une clé commerciale et le profil de licences `commercial`.

## Options écartées

- **Appeler Flickr directement depuis le front** : clé API exposée, licences non filtrées, validation falsifiable.
- **Copier les photos dans notre stockage** : contraire aux conditions d'utilisation et aux licences.

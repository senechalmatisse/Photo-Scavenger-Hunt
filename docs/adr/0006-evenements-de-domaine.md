# ADR 0006 — Événements de domaine en mémoire, évolution vers une boîte d'envoi

- Statut : acceptée
- Date : 2026-11-01

## Contexte

La fin d'une partie a des effets dans plusieurs modules : XP, niveau, série et badges (progression), classements (leaderboards). La suppression d'un compte doit effacer les données de chaque module. Le module `gameplay` ne doit pas dépendre de ces modules, et la réponse au joueur ne doit pas échouer parce qu'un effet secondaire échoue.

## Décision

- Les agrégats enregistrent des événements (`GameSessionStarted`, `GameSessionFinished`, `ChallengePublished`, `ChallengeDisabled`, `LevelReached`, `AchievementUnlocked`, `UserRegistered`, `UserDeleted`), publiés par le cas d'usage **après** l'enregistrement de l'agrégat.
- `InProcessEventBus` les transmet aux abonnés déclarés par chaque module au démarrage (patron Observer). Chaque abonné est isolé : son échec est journalisé avec l'événement et le nom de l'abonné, sans bloquer les autres ni la réponse.
- Les abonnés reçoivent un contenu autonome (`payload`) : ils ne relisent pas les données du module émetteur.

## Conséquences

- Ajouter une réaction (notification, statistique, badge) ne modifie pas le module émetteur.
- Livraison au plus une fois : si un abonné échoue (base ou Redis indisponible), son effet est perdu, mais la partie elle-même (statut et score) reste enregistrée et sert de source de vérité pour une reprise.
- Étape suivante prévue : boîte d'envoi transactionnelle (outbox). Les événements seront écrits dans la même transaction que l'agrégat puis relayés au moins une fois par une file de messages, sans modifier émetteurs ni abonnés. Les abonnés devront alors être idempotents : c'est déjà le cas de la progression (registre par partie, ADR 0003), il faudra le faire pour les classements.

## Options écartées

- **Appels directs entre modules** : `gameplay` dépendrait de la progression et des classements, et chaque nouvelle réaction le modifierait.
- **File de messages dès le MVP** : infrastructure supplémentaire à exploiter sans besoin de charge avéré ; l'interface `EventBus` permet de l'introduire plus tard.

# Faire évoluer le jeu

Chaque évolution prévue par le cahier des charges a un point d'extension : on **ajoute** une classe et on l'**enregistre**, sans modifier le code qui l'utilise (principe ouvert/fermé). Ce guide donne la recette pour chaque cas.
Règles communes :
- le domaine et les cas d'usage restent en TypeScript pur (aucun import de Nest, `pg`, Redis ou Flickr) ;
- un module n'importe du code métier d'un autre module que par son `public-api.ts`. Le câblage Nest importe en plus la classe `*.module.ts` et ses jetons d'injection, et les contrôleurs utilisent les décorateurs d'authentification de `identity/presentation/security.ts` ;
- toute règle nouvelle s'accompagne d'un test unitaire à côté de son domaine (`*.spec.ts`) et, si elle change le parcours, d'un scénario dans `src/testing/game-flow.spec.ts`.

## Ajouter un critère de validation

Exemple : « photo prise en hiver ». Une saison seule ne prouve pas que la photo est la bonne : le critère n'est donc **pas décisif** et devra être combiné avec une photo exacte, une zone ou un lieu (ADR 0002).

1. Écrire la règle dans `challenges/domain/validation/` :

   ```ts
   export class TakenInMonthsRule implements ValidationRule {
     static readonly TYPE = 'TAKEN_IN_MONTHS';
     readonly type = TakenInMonthsRule.TYPE;
     readonly decisive = false;
     readonly children: readonly ValidationRule[] = [];

     constructor(readonly months: readonly number[]) {}

     static parse(spec: RuleSpec, path: string): TakenInMonthsRule {
       const months = SpecReader.array(spec, 'months', path, 1, 12).map((month, index) => {
         if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) {
           throw SpecReader.invalid(`${path}.months[${index}]`, 'mois attendu entre 1 et 12.');
         }
         return month;
       });
       return new TakenInMonthsRule(months);
     }

     evaluate(photo: PhotoFacts): ValidationReport {
       const precise = photo.takenGranularity === 'EXACT' || photo.takenGranularity === 'MONTH';
       const month = photo.takenOn && precise ? Number(photo.takenOn.slice(5, 7)) : null;
       const satisfied = month !== null && this.months.includes(month);
       return leafReport({
         criterion: this.type,
         label: 'Saison de la prise de vue',
         satisfied,
         explanation: satisfied ? 'La photo a été prise à la bonne saison.' : "La photo n'a pas été prise à la saison demandée.",
       });
     }

     toSpec(): RuleSpec {
       return { type: this.type, months: [...this.months] };
     }

     describe(): string {
       return `prise de vue en mois ${this.months.join(', ')}`;
     }
   }
   ```

2. L'enregistrer dans `ValidationRuleFactory.withDefaults()` :
   `.register(TakenInMonthsRule.TYPE, (spec, context) => TakenInMonthsRule.parse(spec, context.path))`.
   La fabrique est partagée par l'administration, l'aperçu de validation et le juge des parties.
3. Ajouter les cas de test dans `validation.spec.ts` (règle seule refusée par `createDecisive`, acceptée
   dans un `ALL_OF` avec une zone, explication affichée).
4. Côté administration, le critère est utilisable tout de suite via le **mode avancé** (JSON) de l'éditeur.
   Pour un formulaire dédié, compléter `buildValidation` / `draftFromValidation` dans
   `frontend/src/app/features/admin/validation-draft.ts` et leur test.

Ne jamais supprimer un type ni changer le sens de ses paramètres : les parties conservent leurs critères figés (`terms.validation`) et doivent rester relisibles. On ajoute un nouveau type à la place.

## Ajouter une règle de barème

Exemple : bonus quand la bonne photo est trouvée du premier coup.

1. Dans `gameplay/domain/scoring.ts` :

   ```ts
   export class FirstTryBonusRule implements ScoreRule {
     constructor(private readonly bonus: number) {}

     apply(context: ScoringContext): ScoreLine | null {
       return context.attempts === 1 ? { code: 'FIRST_TRY', label: 'Trouvée du premier coup', points: this.bonus } : null;
     }
   }
   ```

2. L'insérer dans `ScoringPolicy.standard()` **avant** `ReplayRule`, qui doit rester la dernière (elle annule le sous-total d'une partie rejouée).
3. Rendre le montant paramétrable : champ `firstTryBonus` dans `ScoringConfig` et variable `SCORE_FIRST_TRY_BONUS` lue dans `config/app-config.ts`.

L'écran de résultat affiche les lignes de score telles que l'API les renvoie : rien à changer côté front.
Le barème s'applique aux parties qui se terminent après le déploiement.

## Ajouter un mode de jeu (exploration libre)

Le mode « exploration libre » est le prochain mode prévu. Tout ce qui suit le démarrage (indices, tentatives, chronomètre, score, XP, badges, classements) lit les conditions figées dans la partie et fonctionne donc sans modification.

1. Domaine (`gameplay/domain/game-mode.ts`) : ajouter `'EXPLORATION'` à `GameModeKind`, écrire la politique et l'ajouter à `GameModeRegistry.standard()` :

   ```ts
   export class ExplorationMode implements GameModePolicy {
     readonly kind = 'EXPLORATION';
     readonly label = 'Exploration libre';
     readonly allowsPause = true;
     readonly oncePerDay = false;
     readonly allowsReplay = false;

     expiresAt(): Date | null {
       return null;
     }
   }
   ```

2. Application : un port `MissionGenerator` qui fabrique un `PlayableChallenge` à partir d'une photo géolocalisée tirée au hasard (critère décisif `NEAR_POINT` autour de son lieu, indices calculés à partir de ses mots-clés et de sa date), et un cas d'usage `StartExplorationSession` qui réutilise `buildSessionTerms` et `GameSession.start`. `StartGameSession` (quotidien et catalogue) n'est pas modifié.
3. Persistance : enregistrer la mission générée comme un défi d'origine « générée », absent du catalogue, pour que statistiques, photo de référence et explications fonctionnent comme pour les autres défis ; migration `V002` qui élargit la contrainte `game_sessions_mode_ck` (voir plus bas).
4. Front : une route `/exploration` avec un bouton « Lancer une exploration » qui ouvre la page de partie existante.

## Ajouter un badge

Les badges du cahier des charges sont des spécifications « une mesure atteint un seuil ». Ajouter une entrée dans `DEFAULT_ACHIEVEMENTS` (`progression/domain/achievements.ts`) :

```ts
new ThresholdAchievement('MARATHON', 'Marathonien', 'Réussir 50 missions.', 'flag', (s) => s.stats.missionsWon, 50),
```

puis le symbole de l'icône dans `ACHIEVEMENT_SYMBOLS` (`frontend/src/app/shared/format/labels.ts`).
Les badges sont évalués à chaque partie terminée : un joueur qui remplit déjà la condition le reçoit à sa prochaine mission. Un badge qui ne se réduit pas à un seuil implémente directement `AchievementDefinition`.
S'il faut une nouvelle mesure, l'ajouter à `PlayerStats` et à `PlayerProgress.recordSession` (les statistiques sont stockées en JSONB : pas de migration nécessaire, prévoir une valeur par défaut à la lecture).

## Ajouter une source de photographies

Exemple : Wikimedia Commons en complément de Flickr.

1. Implémenter le port `PhotoCatalog` (`search`, `findById`) dans `photos/infrastructure/<source>/`, en traduisant le format de la source vers `Photo` (auteur, licence, lien vers la page source, date, position, mots-clés). Rien du format externe ne doit sortir de l'adaptateur.
2. Associer chaque licence de la source à un `LicenseCode` existant : la `LicensePolicy` continue de filtrer les photos non autorisées.
3. Préfixer les identifiants (`wm-…`, lettres, chiffres, `-` et `_` uniquement) s'ils peuvent entrer en collision avec ceux de Flickr.
4. Choisir l'adaptateur dans `buildCatalog` (`photos/photos.module.ts`) selon `PHOTO_PROVIDER` : cache, réessais, disjoncteur et mesures s'appliquent automatiquement par décoration.
5. Autoriser le domaine des images dans la directive `img-src` de `frontend/nginx.conf` et respecter les conditions d'utilisation de la source (attribution, nombre de photos par page, durée de cache).

## Remplacer un stockage

Chaque dépôt est une interface du domaine avec deux implémentations (PostgreSQL et mémoire) choisies par `byPersistenceDriver`. Pour une autre technologie, écrire une troisième implémentation et l'ajouter au choix ; les classements suivent le même principe avec `LeaderboardStore` (Redis ou mémoire). Les tests de scénario (`src/testing`) acceptent des dépôts de remplacement via `createInMemoryApp(start, overrides)`, ce qui permet de rejouer tous les parcours sur la nouvelle implémentation.

## Ajouter une migration SQL

Créer `backend/database/migrations/V002__description_courte.sql` en suivant les normes SQL de l'équipe (en-tête, mots-clés en majuscules, objets en minuscules, une colonne par ligne, un commentaire par ordre, sans accent ni tabulation) :

```sql
-- FONCTION: Ajout du mode de jeu EXPLORATION aux parties
--
-- PARAMETRES : Ce programme ne prend pas de parametre
--
-- EXECUTION : par le lanceur de migrations du backend (npm run migrate), dans une transaction unique : arret et annulation au premier echec (equivalent PostgreSQL de WHENEVER SQLERROR EXIT 1)
--

-- Suppression de l'ancienne liste des modes autorises
ALTER TABLE game_sessions
  DROP CONSTRAINT game_sessions_mode_ck;

-- Liste des modes autorises incluant l'exploration libre
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_mode_ck CHECK (mode IN ('DAILY', 'CATALOG', 'EXPLORATION'));
```

Un script déjà appliqué ne se modifie jamais : son empreinte est contrôlée à chaque démarrage. Une correction passe par un nouveau script.

## Ajouter un écran

1. Méthodes d'appel dans `frontend/src/app/core/api/api-clients.ts` et types dans `models.ts`.
2. Composant autonome dans `features/<domaine>/`, état local en signaux ; un état partagé entre plusieurs composants passe par un store injectable (exemple : `GameStore`).
3. Route chargée à la demande dans `app.routes.ts`, protégée par `authGuard` ou `adminGuard`.
4. Réutiliser les composants de `shared/ui` (planche contact, carte, fiche photo, jauge de niveau) et les jetons de `styles.scss` plutôt que de nouvelles couleurs.

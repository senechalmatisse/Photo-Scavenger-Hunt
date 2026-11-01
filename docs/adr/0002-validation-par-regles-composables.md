# ADR 0002 — Validation par règles composables et décisives

- Statut : acceptée
- Date : 2026-11-01

## Contexte

Le cahier des charges prévoit trois façons de valider une réponse, au choix de l'administrateur pour chaque défi : la photographie exacte, des critères (zone, période, mots-clés) ou un lieu avec une tolérance. Il interdit de valider une photo sur un simple mot-clé, exige d'expliquer au joueur pourquoi sa réponse est acceptée ou refusée, et un défi modifié ne doit pas changer les règles d'une partie en cours.

## Décision

- Les critères d'un défi sont un arbre JSON (`RuleSpec`) stocké dans `challenges.validation_spec`.
- `ValidationRuleFactory` (fabrique + registre) transforme cet arbre en objets `ValidationRule` : feuilles `EXACT_PHOTO`, `IN_AREA`, `NEAR_POINT`, `TAKEN_BETWEEN`, `HAS_TAGS` (patron Strategy) et combinaisons `ALL_OF` / `ANY_OF` (patron Composite). Profondeur 4 et 20 critères au maximum.
- Chaque règle déclare si elle est **décisive**. `createDecisive` refuse un arbre dont une branche ne contient ni photo exacte, ni zone, ni lieu : les mots-clés et la période ne suffisent jamais seuls.
- Publier un défi exige que sa photo de référence satisfasse ses propres critères : un défi publié a toujours au moins une solution.
- Les critères sont copiés dans la partie au démarrage ; les faits d'une photo (date, position, mots-clés) sont toujours relus côté serveur auprès du fournisseur, jamais reçus du client.
- Chaque critère produit une ligne d'explication affichée au joueur ; l'administrateur dispose d'un aperçu (`POST /api/admin/validation-preview`) pour tester une photo avant de publier.

## Conséquences

- Un nouveau critère est une classe enregistrée dans la fabrique, sans modifier le reste (docs/extending.md).
- Les trois modes de l'éditeur ne sont que des raccourcis vers la même grammaire ; le mode avancé donne accès aux combinaisons.
- Les parties conservent d'anciens critères : un type ne peut jamais être supprimé ni changer de sens.
- La normalisation des mots-clés (minuscules, sans accents ni ponctuation) approche celle de Flickr sans la reproduire exactement.

## Options écartées

- **Une énumération de modes et un `switch`** : fermé à l'extension, impossible de combiner des critères.
- **Un langage de script évalué** : surface d'attaque et explications illisibles pour le joueur.
- **Similarité d'image par apprentissage automatique** : hors périmètre du MVP ; pourra devenir un critère supplémentaire de la même grammaire.

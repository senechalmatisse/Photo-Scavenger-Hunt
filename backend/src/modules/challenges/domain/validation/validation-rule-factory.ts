import { ValidationError } from '../../../../shared/domain/domain-error';
import { AllOfRule, AnyOfRule, CompositeParseContext } from './composite-rules';
import { ExactPhotoRule, HasTagsRule, InAreaRule, NearPointRule, TakenBetweenRule } from './leaf-rules';
import { RuleSpec, SpecReader, ValidationRule } from './validation-rule';

export type RuleParser = (spec: RuleSpec, context: CompositeParseContext) => ValidationRule;

/**
 * Fabrique de règles à partir de leur forme JSON (patterns Factory + Registry).
 *
 * Ajouter un nouveau type de critère = écrire une classe ValidationRule et l'enregistrer ici
 * (ou via `register` depuis un module) : aucune autre classe n'est modifiée (principe ouvert/fermé).
 */
export class ValidationRuleFactory {
  static readonly MAX_DEPTH = 4;
  static readonly MAX_RULES = 20;

  private readonly parsers = new Map<string, RuleParser>();

  static withDefaults(): ValidationRuleFactory {
    return new ValidationRuleFactory()
      .register(ExactPhotoRule.TYPE, (spec, context) => ExactPhotoRule.parse(spec, context.path))
      .register(InAreaRule.TYPE, (spec, context) => InAreaRule.parse(spec, context.path))
      .register(NearPointRule.TYPE, (spec, context) => NearPointRule.parse(spec, context.path))
      .register(TakenBetweenRule.TYPE, (spec, context) => TakenBetweenRule.parse(spec, context.path))
      .register(HasTagsRule.TYPE, (spec, context) => HasTagsRule.parse(spec, context.path))
      .register(AllOfRule.TYPE, (spec, context) => AllOfRule.parse(spec, context))
      .register(AnyOfRule.TYPE, (spec, context) => AnyOfRule.parse(spec, context));
  }

  register(type: string, parser: RuleParser): this {
    if (this.parsers.has(type)) {
      throw new Error(`Type de critère déjà enregistré : ${type}`);
    }
    this.parsers.set(type, parser);
    return this;
  }

  knownTypes(): string[] {
    return [...this.parsers.keys()];
  }

  /** Construit une règle (sans exiger qu'elle soit décisive). */
  create(spec: unknown, path = 'validation'): ValidationRule {
    let count = 0;
    const parse = (raw: unknown, currentPath: string, depth: number): ValidationRule => {
      if (depth > ValidationRuleFactory.MAX_DEPTH) {
        throw SpecReader.invalid(currentPath, `imbrication limitée à ${ValidationRuleFactory.MAX_DEPTH} niveaux.`);
      }
      count += 1;
      if (count > ValidationRuleFactory.MAX_RULES) {
        throw SpecReader.invalid(currentPath, `${ValidationRuleFactory.MAX_RULES} critères au maximum.`);
      }
      if (typeof raw !== 'object' || raw === null || typeof (raw as { type?: unknown }).type !== 'string') {
        throw SpecReader.invalid(currentPath, 'objet { "type": ..., ... } attendu.');
      }
      const spec = raw as RuleSpec;
      const parser = this.parsers.get(spec.type);
      if (!parser) {
        throw SpecReader.invalid(
          currentPath,
          `type de critère inconnu « ${spec.type} » (types connus : ${this.knownTypes().join(', ')}).`,
        );
      }
      return parser(spec, {
        path: currentPath,
        parseChild: (child, childPath) => parse(child, childPath, depth + 1),
      });
    };
    return parse(spec, path, 0);
  }

  /** Construit une règle et exige qu'elle soit décisive sur chacune de ses branches. */
  createDecisive(spec: unknown, path = 'validation'): ValidationRule {
    const rule = this.create(spec, path);
    if (!rule.decisive) {
      throw new ValidationError(
        'VALIDATION_NOT_DECISIVE',
        'Chaque branche des critères doit contenir une photo exacte, une zone ou un lieu : ' +
          'des mots-clés ou une période seuls ne suffisent pas à valider une réponse.',
        { path },
      );
    }
    return rule;
  }
}

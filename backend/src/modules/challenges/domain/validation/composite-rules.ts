import { PhotoFacts, RuleSpec, SpecReader, ValidationReport, ValidationRule } from './validation-rule';

/** Contexte fourni par la fabrique aux règles composites pour analyser leurs enfants. */
export interface CompositeParseContext {
  readonly path: string;
  parseChild(spec: unknown, path: string): ValidationRule;
}

function parseChildren(spec: RuleSpec, context: CompositeParseContext): ValidationRule[] {
  return SpecReader.array(spec, 'rules', context.path, 1, 10).map((child, index) =>
    context.parseChild(child, `${context.path}.rules[${index}]`),
  );
}

/** Conjonction : tous les critères doivent être satisfaits (pattern Composite). */
export class AllOfRule implements ValidationRule {
  static readonly TYPE = 'ALL_OF';
  readonly type = AllOfRule.TYPE;

  constructor(readonly children: readonly ValidationRule[]) {}

  static parse(spec: RuleSpec, context: CompositeParseContext): AllOfRule {
    return new AllOfRule(parseChildren(spec, context));
  }

  /** Décisive si au moins un critère décisif participe à la conjonction. */
  get decisive(): boolean {
    return this.children.some((child) => child.decisive);
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    const reports = this.children.map((child) => child.evaluate(photo));
    return {
      accepted: reports.every((report) => report.accepted),
      outcomes: reports.flatMap((report) => report.outcomes),
    };
  }

  toSpec(): RuleSpec {
    return { type: this.type, rules: this.children.map((child) => child.toSpec()) };
  }

  describe(): string {
    return this.children.map((child) => child.describe()).join(' et ');
  }
}

/** Disjonction : une branche satisfaite suffit (pattern Composite). */
export class AnyOfRule implements ValidationRule {
  static readonly TYPE = 'ANY_OF';
  readonly type = AnyOfRule.TYPE;

  constructor(readonly children: readonly ValidationRule[]) {}

  static parse(spec: RuleSpec, context: CompositeParseContext): AnyOfRule {
    return new AnyOfRule(parseChildren(spec, context));
  }

  /** Décisive seulement si chaque branche l'est : sinon une branche « tags seuls » suffirait. */
  get decisive(): boolean {
    return this.children.every((child) => child.decisive);
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    const reports = this.children.map((child) => child.evaluate(photo));
    const accepted = reports.find((report) => report.accepted);
    if (accepted) {
      return { accepted: true, outcomes: accepted.outcomes };
    }
    // Explique la branche la plus proche du succès plutôt que toutes les branches.
    const closest = reports.reduce((best, report) =>
      satisfiedCount(report) > satisfiedCount(best) ? report : best,
    );
    return { accepted: false, outcomes: closest.outcomes };
  }

  toSpec(): RuleSpec {
    return { type: this.type, rules: this.children.map((child) => child.toSpec()) };
  }

  describe(): string {
    return this.children.map((child) => `(${child.describe()})`).join(' ou ');
  }
}

function satisfiedCount(report: ValidationReport): number {
  return report.outcomes.filter((outcome) => outcome.satisfied).length;
}

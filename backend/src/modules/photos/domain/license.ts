import { ValidationError } from '../../../shared/domain/domain-error';

/**
 * Licences de photographies, indépendantes du fournisseur.
 * L'adaptateur Flickr traduit ses identifiants numériques vers ces codes (couche anti-corruption).
 */
export const LICENSE_CODES = [
  'ARR',
  'CC-BY-NC-SA-2.0',
  'CC-BY-NC-2.0',
  'CC-BY-NC-ND-2.0',
  'CC-BY-2.0',
  'CC-BY-SA-2.0',
  'CC-BY-ND-2.0',
  'NO-KNOWN-RESTRICTIONS',
  'US-GOV',
  'CC0-1.0',
  'PDM-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'CC-BY-ND-4.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-NC-ND-4.0',
] as const;
export type LicenseCode = (typeof LICENSE_CODES)[number];

export interface License {
  readonly code: LicenseCode;
  readonly name: string;
  readonly url: string | null;
  /** Usage commercial autorisé par la licence (si l'application devient commerciale). */
  readonly allowsCommercialUse: boolean;
}

const cc = (code: LicenseCode, name: string, path: string, commercial: boolean): License => ({
  code,
  name,
  url: `https://creativecommons.org/${path}`,
  allowsCommercialUse: commercial,
});

export const LICENSES: Readonly<Record<LicenseCode, License>> = {
  ARR: { code: 'ARR', name: 'Tous droits réservés', url: null, allowsCommercialUse: false },
  'CC-BY-NC-SA-2.0': cc('CC-BY-NC-SA-2.0', 'CC BY-NC-SA 2.0', 'licenses/by-nc-sa/2.0/', false),
  'CC-BY-NC-2.0': cc('CC-BY-NC-2.0', 'CC BY-NC 2.0', 'licenses/by-nc/2.0/', false),
  'CC-BY-NC-ND-2.0': cc('CC-BY-NC-ND-2.0', 'CC BY-NC-ND 2.0', 'licenses/by-nc-nd/2.0/', false),
  'CC-BY-2.0': cc('CC-BY-2.0', 'CC BY 2.0', 'licenses/by/2.0/', true),
  'CC-BY-SA-2.0': cc('CC-BY-SA-2.0', 'CC BY-SA 2.0', 'licenses/by-sa/2.0/', true),
  'CC-BY-ND-2.0': cc('CC-BY-ND-2.0', 'CC BY-ND 2.0', 'licenses/by-nd/2.0/', true),
  'NO-KNOWN-RESTRICTIONS': {
    code: 'NO-KNOWN-RESTRICTIONS',
    name: 'Aucune restriction de droit connue',
    url: 'https://www.flickr.com/commons/usage/',
    allowsCommercialUse: true,
  },
  'US-GOV': {
    code: 'US-GOV',
    name: 'Œuvre du gouvernement des États-Unis',
    url: 'https://www.usa.gov/government-copyright',
    allowsCommercialUse: true,
  },
  'CC0-1.0': cc('CC0-1.0', 'Domaine public (CC0)', 'publicdomain/zero/1.0/', true),
  'PDM-1.0': cc('PDM-1.0', 'Marque du domaine public', 'publicdomain/mark/1.0/', true),
  'CC-BY-4.0': cc('CC-BY-4.0', 'CC BY 4.0', 'licenses/by/4.0/', true),
  'CC-BY-SA-4.0': cc('CC-BY-SA-4.0', 'CC BY-SA 4.0', 'licenses/by-sa/4.0/', true),
  'CC-BY-ND-4.0': cc('CC-BY-ND-4.0', 'CC BY-ND 4.0', 'licenses/by-nd/4.0/', true),
  'CC-BY-NC-4.0': cc('CC-BY-NC-4.0', 'CC BY-NC 4.0', 'licenses/by-nc/4.0/', false),
  'CC-BY-NC-SA-4.0': cc('CC-BY-NC-SA-4.0', 'CC BY-NC-SA 4.0', 'licenses/by-nc-sa/4.0/', false),
  'CC-BY-NC-ND-4.0': cc('CC-BY-NC-ND-4.0', 'CC BY-NC-ND 4.0', 'licenses/by-nc-nd/4.0/', false),
};

export type LicenseProfile = 'non-commercial' | 'commercial';

/**
 * Politique de licences (pattern Strategy) : quelles photos le jeu peut afficher et accepter.
 * « Publique » ne veut pas dire « libre de réutilisation » : « Tous droits réservés » est exclu par défaut.
 */
export class LicensePolicy {
  private constructor(private readonly allowed: ReadonlySet<LicenseCode>) {}

  static forProfile(profile: LicenseProfile): LicensePolicy {
    const codes = LICENSE_CODES.filter(
      (code) => code !== 'ARR' && (profile === 'non-commercial' || LICENSES[code].allowsCommercialUse),
    );
    return new LicensePolicy(new Set(codes));
  }

  static fromCodes(codes: readonly string[]): LicensePolicy {
    const unknown = codes.filter((code) => !(LICENSE_CODES as readonly string[]).includes(code));
    if (codes.length === 0 || unknown.length > 0) {
      throw new ValidationError('INVALID_LICENSE_POLICY', `Licences inconnues ou liste vide : ${unknown.join(', ')}`);
    }
    return new LicensePolicy(new Set(codes as LicenseCode[]));
  }

  allows(code: LicenseCode): boolean {
    return this.allowed.has(code);
  }

  allowedCodes(): LicenseCode[] {
    return LICENSE_CODES.filter((code) => this.allowed.has(code));
  }
}

/** Erreur renvoyée par l'API Flickr (`stat: "fail"`). Code 1 = photo introuvable. */
export class FlickrApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`Flickr ${code} : ${message}`);
  }

  get isNotFound(): boolean {
    return this.code === 1;
  }

  /** 105 : service indisponible ; 0 : panne interne. */
  get isTransient(): boolean {
    return this.code === 105 || this.code === 0;
  }
}

/** Erreur de transport (HTTP 5xx, 429, délai dépassé, réseau) : réessayable. */
export class FlickrTransportError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }

  get isTransient(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }
}

export interface FlickrClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Injectable pour les tests (fetch natif de Node par défaut). */
  readonly fetchFn?: typeof fetch;
}

type Params = Record<string, string | number | undefined>;

/**
 * Client HTTP minimal de l'API REST Flickr (format JSON).
 * Il ne connaît que le protocole : la traduction vers le domaine est faite par FlickrPhotoCatalog.
 * La clé d'API n'est jamais journalisée.
 */
export class FlickrApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: FlickrClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async call<T>(method: string, params: Params): Promise<T> {
    const url = new URL(this.options.baseUrl);
    url.searchParams.set('method', method);
    url.searchParams.set('api_key', this.options.apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('nojsoncallback', '1');
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new FlickrTransportError(`${method} : ${error instanceof Error ? error.name : 'erreur réseau'}`, null);
    }
    if (!response.ok) {
      throw new FlickrTransportError(`${method} : HTTP ${response.status}`, response.status);
    }
    const body = (await response.json()) as { stat?: string; code?: number; message?: string };
    if (body.stat !== 'ok') {
      throw new FlickrApiError(body.code ?? 0, body.message ?? 'réponse inattendue');
    }
    return body as T;
  }
}

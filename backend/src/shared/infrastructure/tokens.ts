/** Jetons d'injection des ports transverses (inversion de dépendance via le conteneur Nest). */
export const APP_CONFIG = Symbol('AppConfig');
export const CLOCK = Symbol('Clock');
export const ID_GENERATOR = Symbol('IdGenerator');
export const RANDOM_SOURCE = Symbol('RandomSource');
export const EVENT_BUS = Symbol('EventBus');
export const UNIT_OF_WORK = Symbol('UnitOfWork');
export const GAME_CALENDAR = Symbol('GameCalendar');
export const APP_LOGGER = Symbol('AppLogger');
export const PG_DATABASE = Symbol('PgDatabase');
export const REDIS_CLIENT = Symbol('RedisClient');
export const CACHE_STORE = Symbol('CacheStore');

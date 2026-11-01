import { AppSettings } from '../app/core/settings';

export const environment: AppSettings = {
  production: true,
  apiBaseUrl: '/api',
  map: {
    // Serveur de tuiles OSM : à remplacer par un fournisseur dédié en cas de fort trafic (politique d'usage OSM).
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
  },
};

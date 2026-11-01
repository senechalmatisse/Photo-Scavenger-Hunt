import { AppSettings } from '../app/core/settings';

export const environment: AppSettings = {
  production: false,
  apiBaseUrl: '/api',
  map: {
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
  },
};

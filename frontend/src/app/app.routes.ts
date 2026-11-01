import { Routes } from '@angular/router';
import { adminGuard, authGuard, visitorGuard } from './core/auth/auth.guards';

/** Routes en français ; chaque fonctionnalité est chargée à la demande. */
export const routes: Routes = [
  {
    path: 'connexion',
    canActivate: [visitorGuard],
    title: 'Connexion - Photo Scavenger Hunt',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'inscription',
    canActivate: [visitorGuard],
    title: 'Créer un compte - Photo Scavenger Hunt',
    loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Accueil - Photo Scavenger Hunt',
        loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'defis',
        title: 'Défis - Photo Scavenger Hunt',
        loadComponent: () => import('./features/challenges/catalog-page').then((m) => m.CatalogPage),
      },
      {
        path: 'defis/:id',
        title: 'Défi - Photo Scavenger Hunt',
        loadComponent: () => import('./features/challenges/challenge-detail-page').then((m) => m.ChallengeDetailPage),
      },
      {
        path: 'partie/:id',
        title: 'Partie en cours - Photo Scavenger Hunt',
        loadComponent: () => import('./features/game/game-page').then((m) => m.GamePage),
      },
      {
        path: 'classements',
        title: 'Classements - Photo Scavenger Hunt',
        loadComponent: () => import('./features/leaderboard/leaderboard-page').then((m) => m.LeaderboardPage),
      },
      {
        path: 'profil',
        title: 'Profil - Photo Scavenger Hunt',
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          {
            path: '',
            title: 'Administration - Photo Scavenger Hunt',
            loadComponent: () => import('./features/admin/admin-challenges-page').then((m) => m.AdminChallengesPage),
          },
          {
            path: 'defis/nouveau',
            title: 'Nouveau défi - Photo Scavenger Hunt',
            loadComponent: () => import('./features/admin/challenge-editor-page').then((m) => m.ChallengeEditorPage),
          },
          {
            path: 'defis/:id',
            title: 'Modifier un défi - Photo Scavenger Hunt',
            loadComponent: () => import('./features/admin/challenge-editor-page').then((m) => m.ChallengeEditorPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

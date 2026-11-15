import type { Routes } from '@angular/router';

/** The API client pages, under `/clients` and behind `clients:manage` (app.routes.ts). */
export const CLIENT_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/client-list').then((m) => m.ClientList) },
  {
    path: 'create',
    title: 'Add API client',
    loadComponent: () => import('./pages/client-form').then((m) => m.ClientForm),
  },
  {
    path: ':id',
    title: 'API client',
    loadComponent: () => import('./pages/client-detail').then((m) => m.ClientDetail),
  },
  {
    path: ':id/edit',
    title: 'Edit API client',
    loadComponent: () => import('./pages/client-form').then((m) => m.ClientForm),
  },
];

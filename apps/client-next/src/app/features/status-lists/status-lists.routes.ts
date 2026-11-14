import type { Routes } from '@angular/router';

/**
 * The status list pages, under `/status-lists` and behind `issuance:manage` (app.routes.ts):
 * the lists, creating one, one list with what it is bound to, and the tenant's settings.
 */
export const STATUS_LIST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/status-list-list').then((m) => m.StatusListList),
  },
  {
    path: 'config',
    title: 'Status list settings',
    loadComponent: () => import('./pages/status-list-settings').then((m) => m.StatusListSettings),
  },
  {
    path: 'create',
    title: 'New status list',
    loadComponent: () => import('./pages/status-list-create').then((m) => m.StatusListCreate),
  },
  {
    path: ':listId',
    title: 'Status list',
    loadComponent: () => import('./pages/status-list-detail').then((m) => m.StatusListDetail),
  },
];

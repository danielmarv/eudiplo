import type { Routes } from '@angular/router';

/** The people of the tenant, under `/users` and behind `users:manage` (app.routes.ts). */
export const USER_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/user-list').then((m) => m.UserList) },
  {
    path: 'create',
    title: 'Add person',
    loadComponent: () => import('./pages/user-form').then((m) => m.UserForm),
  },
  {
    path: ':id',
    title: 'Person',
    loadComponent: () => import('./pages/user-detail').then((m) => m.UserDetail),
  },
  {
    path: ':id/edit',
    title: 'Edit person',
    loadComponent: () => import('./pages/user-form').then((m) => m.UserForm),
  },
];

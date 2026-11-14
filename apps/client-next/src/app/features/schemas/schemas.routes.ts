import type { Routes } from '@angular/router';
import { requireRole } from '../../core/auth/guards';

/**
 * The schema pages, under `/schema` and behind `registrar:manage` (app.routes.ts). Publishing a
 * new schema also needs `issuance:manage`, as the backend builds it from credential types.
 */
export const SCHEMA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/schema-list').then((m) => m.SchemaList),
  },
  {
    path: 'create',
    title: 'Publish schema',
    canActivate: [requireRole('issuance:manage')],
    loadComponent: () => import('./pages/schema-create').then((m) => m.SchemaCreate),
  },
  {
    path: ':id',
    title: 'Schema',
    loadComponent: () => import('./pages/schema-detail').then((m) => m.SchemaDetail),
  },
];

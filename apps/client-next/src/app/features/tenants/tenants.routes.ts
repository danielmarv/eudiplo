import type { Routes } from '@angular/router';

const tenantForm = () => import('./pages/tenant-form').then((m) => m.TenantForm);

/** The tenant pages, under `/tenants` and behind `tenants:manage` (app.routes.ts). */
export const TENANT_ROUTES: Routes = [
  {
    path: '',
    title: 'Tenants',
    loadComponent: () => import('./pages/tenant-list').then((m) => m.TenantList),
  },
  { path: 'create', title: 'Add tenant', loadComponent: tenantForm },
  {
    path: ':id',
    title: 'Tenant',
    loadComponent: () => import('./pages/tenant-detail').then((m) => m.TenantDetail),
  },
  { path: ':id/edit', title: 'Edit tenant', loadComponent: tenantForm },
];

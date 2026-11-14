import type { Routes } from '@angular/router';

/**
 * Presentation configuration management: searchable list, detail, and create/edit/copy flows.
 * The feature sits behind `presentation:manage` in the application routes.
 */
export const PRESENTATION_CONFIG_ROUTES: Routes = [
  {
    path: '',
    title: 'Presentation configurations',
    loadComponent: () =>
      import('./pages/presentation-config-list').then((m) => m.PresentationConfigList),
  },
  {
    path: 'create',
    title: 'New presentation configuration',
    loadComponent: () =>
      import('./pages/presentation-config-form').then((m) => m.PresentationConfigForm),
  },
  {
    path: ':id',
    title: 'Presentation configuration',
    loadComponent: () =>
      import('./pages/presentation-config-detail').then((m) => m.PresentationConfigDetail),
  },
  {
    path: ':id/edit',
    title: 'Edit presentation configuration',
    loadComponent: () =>
      import('./pages/presentation-config-form').then((m) => m.PresentationConfigForm),
  },
  {
    path: ':id/copy',
    title: 'Copy presentation configuration',
    data: { copy: true },
    loadComponent: () =>
      import('./pages/presentation-config-form').then((m) => m.PresentationConfigForm),
  },
];

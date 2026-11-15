import type { Routes } from '@angular/router';

/** The activity log, under `/admin/activity-logs` and behind its roles (app.routes.ts). */
export const ACTIVITY_LOG_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/activity-log').then((m) => m.ActivityLog) },
];

import { Routes } from '@angular/router';
import { sandboxRoutes } from './sandboxes/sandbox.routes';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./sandboxes/dashboard/dashboard').then((m) => m.Dashboard),
  },
  ...sandboxRoutes,
];

import { Routes } from '@angular/router';
import { sandboxRoutes } from './sandboxes/sandbox.routes';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./sandboxes/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    // Wraps every /s/* sandbox in a shell that provides a back-to-dashboard link.
    path: '',
    loadComponent: () =>
      import('./sandboxes/shell/sandbox-shell').then((m) => m.SandboxShell),
    children: sandboxRoutes,
  },
];

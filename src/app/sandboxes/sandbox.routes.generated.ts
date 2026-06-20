import { Routes } from '@angular/router';

export const generatedSandboxRoutes: Routes = [
  { path: 's/test-sandbox', loadComponent: () => import('./generated/test-sandbox/test-sandbox').then((m) => m.TestSandbox) },
];

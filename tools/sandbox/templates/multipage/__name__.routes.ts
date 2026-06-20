import { Routes } from '@angular/router';
import { {{className}} } from './{{name}}';
import { {{className}}Overview } from './pages/overview/overview';
import { {{className}}Details } from './pages/details/details';

export const routes: Routes = [
  {
    path: '',
    component: {{className}},
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: {{className}}Overview },
      { path: 'details', component: {{className}}Details },
    ],
  },
];

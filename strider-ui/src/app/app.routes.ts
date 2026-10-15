import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@app/features/explore/explore.view').then((m) => m.ExploreView),
    title: 'Strider — Explore',
  },
  {
    path: 'traces/:id',
    loadComponent: () =>
      import('@app/features/trace-detail/trace-detail.view').then((m) => m.TraceDetailView),
    title: 'Strider — Trace',
  },
  { path: '**', redirectTo: '' },
];

import { Route } from '@angular/router';

/**
 * `/blog` and `/blog/:slug`.
 *
 * Both lazy and both server-rendered — an editorial section that only exists after
 * JavaScript runs is an editorial section a crawler never reads, which defeats the reason
 * for writing it.
 */
export const BLOG_ROUTES: Route[] = [
  {
    path: '',
    loadComponent: () => import('./blog').then((m) => m.Blog),
    title: 'Blog — HostelHive',
  },
  {
    path: ':slug',
    loadComponent: () => import('./blog-article/blog-article').then((m) => m.BlogArticle),
  },
];

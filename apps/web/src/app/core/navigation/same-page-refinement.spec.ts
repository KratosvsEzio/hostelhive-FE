import { DefaultUrlSerializer, Navigation, NavigationExtras, UrlTree } from '@angular/router';
import { isSamePageRefinement } from './same-page-refinement';

describe('isSamePageRefinement', () => {
  const serializer = new DefaultUrlSerializer();
  const serialize = (tree: UrlTree) => serializer.serialize(tree);

  type Trigger = Navigation['trigger'];

  interface Row {
    name: string;
    trigger: Trigger;
    replaceUrl: boolean;
    previous: string | null;
    url: string;
    expected: boolean;
  }

  // Only the fields the predicate reads are populated; the rest of a Navigation is the router's.
  function navigation(row: Row): Pick<Navigation, 'trigger' | 'extras' | 'previousNavigation'> {
    const extras: NavigationExtras = row.replaceUrl ? { replaceUrl: true } : {};
    const previousNavigation =
      row.previous === null
        ? null
        : ({ finalUrl: serializer.parse(row.previous) } as unknown as Navigation);
    return { trigger: row.trigger, extras, previousNavigation };
  }

  const rows: Row[] = [
    {
      name: 'counts the first load, which has no previous navigation',
      trigger: 'imperative',
      replaceUrl: true,
      previous: null,
      url: '/en/search',
      expected: false,
    },
    {
      name: 'skips a replace that adds the viewport to the search page',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search',
      url: '/en/search?lat=24.8&lng=67.0',
      expected: true,
    },
    {
      name: 'skips a replace that pans the viewport',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search?lat=1&lng=1',
      url: '/en/search?lat=2&lng=2',
      expected: true,
    },
    {
      name: 'skips a replace that clears a listing query',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/hostel/abc?review=5',
      url: '/en/hostel/abc',
      expected: true,
    },
    {
      name: 'counts a replace to a different path',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/hostel/abc',
      url: '/en/search',
      expected: false,
    },
    {
      name: 'counts a replace that only changes the language',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search',
      url: '/ur/search',
      expected: false,
    },
    {
      name: 'counts a pushed query change on the same path',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/search',
      url: '/en/search?gender=girls',
      expected: false,
    },
    {
      name: 'counts Back between two entries of the same path',
      trigger: 'popstate',
      replaceUrl: true,
      previous: '/en/search?place=B',
      url: '/en/search?place=A',
      expected: false,
    },
    {
      name: 'counts Back across paths',
      trigger: 'popstate',
      replaceUrl: true,
      previous: '/en/search',
      url: '/en/hostel/abc',
      expected: false,
    },
    {
      name: 'counts a hashchange replace with a different query on the same path',
      trigger: 'hashchange',
      replaceUrl: true,
      previous: '/en/search?a=1',
      url: '/en/search?a=2',
      expected: false,
    },
    {
      name: 'skips a pushed move to a fragment of the same page',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/blog/x',
      url: '/en/blog/x#costs',
      expected: true,
    },
    {
      name: 'skips Back from a fragment to the bare page',
      trigger: 'popstate',
      replaceUrl: true,
      previous: '/en/blog/x#costs',
      url: '/en/blog/x',
      expected: true,
    },
    {
      name: 'skips a pushed move from one fragment to another',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/blog/x#a',
      url: '/en/blog/x#b',
      expected: true,
    },
    {
      name: 'counts a changed query even when the fragment is kept',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/search?q=1#a',
      url: '/en/search?q=2#a',
      expected: false,
    },
    {
      name: 'counts a navigation to the identical URL',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/search?q=1',
      url: '/en/search?q=1',
      expected: false,
    },
    {
      name: 'counts a guard redirect that has no previous navigation',
      trigger: 'imperative',
      replaceUrl: true,
      previous: null,
      url: '/en/search',
      expected: false,
    },
    {
      name: 'counts a guard redirect that lands on a different path',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/hostel/abc',
      url: '/en/search',
      expected: false,
    },
    {
      name: 'skips a guard redirect that lands on the same path',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search?a=1',
      url: '/en/search?a=2',
      expected: true,
    },
  ];

  it.each(rows)('$name', (row) => {
    expect(isSamePageRefinement(navigation(row), row.url, serialize)).toBe(row.expected);
  });
});

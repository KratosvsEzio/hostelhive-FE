import { MODERATOR_ROUTES } from './moderator.routes';

describe('feature-moderator routes', () => {
  it('exposes the six moderator screens', () => {
    expect(MODERATOR_ROUTES.map((r) => r.path)).toEqual([
      'queue',
      'review/:id',
      'media',
      'listings',
      'audit',
      'settings',
    ]);
  });
});

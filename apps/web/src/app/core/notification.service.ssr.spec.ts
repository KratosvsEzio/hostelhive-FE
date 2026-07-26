// @vitest-environment node
import { NotificationService } from './notification.service';

describe('NotificationService (SSR)', () => {
  it('returns -1 and pushes nothing when window is absent', () => {
    const service = new NotificationService();
    const id = service.show({ kind: 'info', title: 'ssr' });
    expect(id).toBe(-1);
    expect(service.toasts().length).toBe(0);
  });
});

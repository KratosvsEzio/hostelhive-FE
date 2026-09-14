import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { ModerationApi, UNLABELLED } from './moderation-api';

/** Records what the last read put on the wire. Every test here makes exactly one. */
class ApiClientStub {
  body: unknown = {};
  url = '';
  params: Record<string, unknown> = {};

  get<T>(url: string, params?: Record<string, unknown>): Observable<T> {
    this.url = url;
    this.params = params ?? {};
    return of(this.body as T);
  }
}

function setUp(body: unknown = {}): { api: ModerationApi; http: ApiClientStub } {
  TestBed.resetTestingModule();
  const http = new ApiClientStub();
  http.body = body;
  TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: http }] });
  return { api: TestBed.inject(ModerationApi), http };
}

/**
 * The media queue's reads.
 *
 * These assert the query string rather than the result, because the query string is the part
 * that can be wrong without anything failing: a filter the search layer does not recognise is
 * not rejected, it is ignored — the endpoint answers 200 with the unfiltered queue, and the
 * page looks like a label nobody has used yet.
 */
describe('ModerationApi.attachments', () => {
  function params(label?: string, status?: string): Record<string, unknown> {
    const { api, http } = setUp();
    api.attachments(1, status, label).subscribe();
    return http.params;
  }

  it('reads the moderator queue, ten at a time', () => {
    const { api, http } = setUp();

    api.attachments(2).subscribe();

    expect(http.url).toBe('/api/moderator/attachments');
    expect(http.params).toEqual({ page: 2, limit: 10 });
  });

  /**
   * On the label's **name**, not its id.
   *
   * The search index carries the label's raw database id while the options endpoints hand out
   * an obfuscated one, so an id filter would compare two different numbering schemes and match
   * nothing at all. The name is the same string on both sides.
   */
  it('filters on the label name', () => {
    expect(params('Kitchen')['f[attachment_label.name]']).toBe('Kitchen');
  });

  it('asks for the unlabelled photos with the search layer own sentinel', () => {
    // `null` is not a value being compared against — it is how the search layer is told to
    // match documents where the field is absent.
    expect(params(UNLABELLED)['f[attachment_label.name]']).toBe('null');
  });

  it('sends no label filter when none is picked', () => {
    expect('f[attachment_label.name]' in params()).toBe(false);
    expect('f[attachment_label.name]' in params('')).toBe(false);
  });

  it('carries a status and a label together', () => {
    const p = params('Kitchen', 'rejected');

    expect(p['f[status.slug]']).toBe('rejected');
    expect(p['f[attachment_label.name]']).toBe('Kitchen');
  });
});

describe('ModerationApi.attachmentLabels', () => {
  function labels(body: unknown): { name: string }[] {
    const { api, http } = setUp(body);
    let out: { name: string }[] = [];
    api.attachmentLabels().subscribe((l) => (out = l));
    expect(http.url).toBe('/api/moderator/attachments/new');
    return out;
  }

  // The endpoint names the key in the singular, which is easy to read past.
  it('reads the singular key the endpoint sends', () => {
    expect(
      labels({ success: true, attachment_label: [{ id: 11, name: 'Kitchen' }] }).map((l) => l.name),
    ).toEqual(['Kitchen']);
  });

  it('reads the plural too, in case it is ever regularised', () => {
    expect(
      labels({ success: true, attachment_labels: [{ id: 11, name: 'Kitchen' }] }).map((l) => l.name),
    ).toEqual(['Kitchen']);
  });

  it('answers with nothing when the payload carries neither', () => {
    expect(labels({ success: true })).toEqual([]);
  });
});

/**
 * The stored status of a photo, carried through to the review grid.
 *
 * Every attachment used to be mapped `pending` whatever the server held, so a rejection
 * recorded in an earlier review came back looking untouched. The rejection persisted; the
 * screen never looked. A moderator returning to the listing saw a photo somebody had already
 * turned down sitting there as an ordinary photo, and the only thing left to do with it was
 * reject it again.
 *
 * Found against the live API, not here — the tests written when rejections were first made to
 * persist all asserted the write, and none asserted the read.
 */
describe('ModerationApi.getById — a photo the server has rejected', () => {
  function hostelWith(statuses: string[]): unknown {
    return {
      hostel: {
        id: 1,
        name: 'Ever Care',
        attachments: statuses.map((status, i) => ({
          id: `a${i + 1}`,
          url: `https://cdn.test/a${i + 1}.jpg`,
          status,
          content_type: 'image/jpeg',
        })),
      },
    };
  }

  function decisions(statuses: string[]): string[] {
    const { api } = setUp(hostelWith(statuses));
    let out: string[] = [];
    api.getById('1').subscribe((d) => {
      out = d.photos.map((p) => p.decision);
    });
    return out;
  }

  it('marks it rejected rather than pending', () => {
    expect(decisions(['active', 'rejected', 'active'])).toEqual([
      'pending',
      'rejected',
      'pending',
    ]);
  });

  it('leaves a live photo pending', () => {
    expect(decisions(['active', 'active'])).toEqual(['pending', 'pending']);
  });

  /** No status at all is the older serializer; it is not evidence of a rejection. */
  it('treats a missing status as pending rather than guessing', () => {
    const { api } = setUp({
      hostel: {
        id: 1,
        attachments: [{ id: 'a1', url: 'https://cdn.test/a1.jpg', content_type: 'image/jpeg' }],
      },
    });
    let out: string[] = [];
    api.getById('1').subscribe((d) => (out = d.photos.map((p) => p.decision)));

    expect(out).toEqual(['pending']);
  });
});

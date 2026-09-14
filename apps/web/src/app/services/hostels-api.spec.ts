import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { HostelsApi } from './hostels-api';

class ApiClientStub {
  body: unknown = {};
  get<T>(): Observable<T> {
    return of(this.body as T);
  }
}

function setUp(body: unknown): HostelsApi {
  TestBed.resetTestingModule();
  const api = new ApiClientStub();
  api.body = body;
  TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
  return TestBed.inject(HostelsApi);
}

/**
 * Reading `GET /api/hostels/new`.
 *
 * Every enum the hostel form offers comes from here, and a key read under the wrong name does
 * not fail — it yields `[]`, the caller falls back to its hardcoded pair, and the form looks
 * entirely normal while ignoring the server. That is what had happened to the billing cycle:
 * the endpoint sends `billing_frequency_type` and this read `billing_frequency_types`, so the
 * dropdown had been running on its fallback for as long as it has existed.
 */
describe('HostelsApi.formOptions', () => {
  const LIVE = {
    success: true,
    gender_types: [{ id: 1, slug: 'boys', name: 'Boys' }],
    property_types: [{ id: 3, slug: 'house', name: 'House' }],
    billing_frequency_type: [
      { id: 0, slug: 'month', name: 'Month' },
      { id: 1, slug: 'night', name: 'Night' },
    ],
    occupancy_type: [
      { id: 0, slug: 'shared', name: 'Shared' },
      { id: 1, slug: 'private_room', name: 'Private_room' },
    ],
    attachment_labels: [{ id: 'qTFruf', name: 'Room' }],
  };

  it('reads the payload the endpoint actually sends', async () => {
    const options = await new Promise<{ occupancyTypes: unknown[]; billingFrequencyTypes: unknown[] }>(
      (resolve) => setUp(LIVE).formOptions().subscribe(resolve),
    );

    expect(options.occupancyTypes).toEqual(LIVE.occupancy_type);
    expect(options.billingFrequencyTypes).toEqual(LIVE.billing_frequency_type);
  });

  // Both spellings are accepted rather than betting on which one a given deploy sends.
  it('accepts the plural spellings too', async () => {
    const options = await new Promise<{ occupancyTypes: unknown[]; billingFrequencyTypes: unknown[] }>(
      (resolve) =>
        setUp({
          success: true,
          billing_frequency_types: [{ id: 0, slug: 'month', name: 'Month' }],
          occupancy_types: [{ id: 0, slug: 'shared', name: 'Shared' }],
        })
          .formOptions()
          .subscribe(resolve),
    );

    expect(options.billingFrequencyTypes).toHaveLength(1);
    expect(options.occupancyTypes).toHaveLength(1);
  });

  it('answers with empty lists rather than throwing on a bare response', async () => {
    const options = await new Promise<Record<string, unknown[]>>((resolve) =>
      setUp({ success: true }).formOptions().subscribe(resolve as never),
    );

    expect(options['genderTypes']).toEqual([]);
    expect(options['propertyTypes']).toEqual([]);
    expect(options['billingFrequencyTypes']).toEqual([]);
    expect(options['occupancyTypes']).toEqual([]);
    expect(options['attachmentLabels']).toEqual([]);
  });
});

/**
 * Which document a hostel is read from, which is not a detail.
 *
 * A wrong path here does not fail: every one of these endpoints answers with a hostel in the
 * same `{ hostel, success }` envelope, so the screen renders perfectly and simply shows the
 * wrong version of the record. Moderation is the case where that matters most — reviewing the
 * *published* document means deciding about a version that is, by definition, not the one
 * awaiting a decision.
 */
describe('HostelsApi — which hostel document is read', () => {
  function capture() {
    const paths: string[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiClient,
          useValue: {
            get: (path: string) => {
              paths.push(path);
              return of({ hostel: { id: 'MjvuEl', name: 'Backpacker' } });
            },
          },
        },
      ],
    });
    return { api: TestBed.inject(HostelsApi), paths };
  }

  it('reads the moderator document for review', () => {
    const { api, paths } = capture();

    api.getForModeration('MjvuEl').subscribe();

    expect(paths).toEqual(['/api/moderator/hostels/MjvuEl']);
  });

  // The public listing page still wants the published document, and must not follow.
  it('still reads the public document for everyone else', () => {
    const { api, paths } = capture();

    api.getById('MjvuEl').subscribe();

    expect(paths).toEqual(['/public/hostel_detail/MjvuEl']);
  });

  it('maps the moderator envelope with the same mapper', () => {
    const { api } = capture();

    let detail: { id?: string | number; name?: string } | undefined;
    api.getForModeration('MjvuEl').subscribe((d) => (detail = d));

    expect(detail?.id).toBe('MjvuEl');
    expect(detail?.name).toBe('Backpacker');
  });
});

/**
 * The gated contact reveal.
 *
 * The endpoint has always answered with three fields; this read one and discarded the rest,
 * so a hostel reachable on two numbers appeared to have one and an email-only hostel appeared
 * to have no contact details at all.
 *
 * Absent values are normalised to null. The wire sends null, the old mapper turned that into
 * "", and the caller then tested for falsiness — two spellings of the same thing in two
 * files, which is how one of them ends up unhandled.
 */
describe('HostelsApi.showPhone', () => {
  function reveal(phone_detail: unknown) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: { get: () => of({ phone_detail, success: true }) } }],
    });
    let out: { primaryPhone: string | null; secondaryPhone: string | null; email: string | null } | undefined;
    TestBed.inject(HostelsApi).showPhone('MjvuEl').subscribe((d) => (out = d));
    return out!;
  }

  it('returns all three, not just the number', () => {
    expect(
      reveal({
        primary_phone: '+923030491909',
        secondary_phone: '+923001112222',
        email: 'host@example.com',
      }),
    ).toEqual({
      primaryPhone: '+923030491909',
      secondaryPhone: '+923001112222',
      email: 'host@example.com',
    });
  });

  // Exactly what the live endpoint returns for a hostel with one number.
  it('reads a null secondary as null, not an empty string', () => {
    const d = reveal({ primary_phone: '+923030491909', secondary_phone: null, email: 'h@e.com' });

    expect(d.secondaryPhone).toBeNull();
  });

  it('normalises an empty string to null too', () => {
    const d = reveal({ primary_phone: '', secondary_phone: '', email: '' });

    expect(d).toEqual({ primaryPhone: null, secondaryPhone: null, email: null });
  });

  it('survives the field being absent altogether', () => {
    expect(reveal(undefined)).toEqual({ primaryPhone: null, secondaryPhone: null, email: null });
  });

  // An email-only hostel is reachable; the old mapper reported it as nothing at all.
  it('keeps an email with no phone', () => {
    const d = reveal({ primary_phone: null, secondary_phone: null, email: 'host@example.com' });

    expect(d.email).toBe('host@example.com');
    expect(d.primaryPhone).toBeNull();
  });
});

class PutSpyClient {
  calls: { url: string; body: unknown }[] = [];
  put<T>(url: string, body: unknown): Observable<T> {
    this.calls.push({ url, body });
    return of(undefined as T);
  }
}

/**
 * `PUT /api/attachments/:id/mark_as_primary`.
 *
 * The shape matters more than it looks. Its neighbour `update_label` nests its body under
 * `attachment` and answers 422 to a flat one; this action reads the attachment from the URL
 * and takes no body at all. Sending it label-shaped would be a silent no-op at best.
 */
describe('HostelsApi.markAttachmentAsPrimary', () => {
  function spyApi(): { api: PutSpyClient; hostels: HostelsApi } {
    TestBed.resetTestingModule();
    const api = new PutSpyClient();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    return { api, hostels: TestBed.inject(HostelsApi) };
  }

  it('puts to the attachment, and sends no body', () => {
    const { api, hostels } = spyApi();
    hostels.markAttachmentAsPrimary('a1b2c3').subscribe();
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].url).toBe('/api/attachments/a1b2c3/mark_as_primary');
    expect(api.calls[0].body).toEqual({});
  });

  it('sends one call, not one per photo', () => {
    // The server clears `is_primary` on every sibling itself. A client-side unset of the old
    // one would be a second request, and a window in which the hostel had two or none.
    const { api, hostels } = spyApi();
    hostels.markAttachmentAsPrimary('new-primary').subscribe();
    expect(api.calls).toHaveLength(1);
  });

  it('keeps the label endpoint nested, which this one is not', () => {
    const { api, hostels } = spyApi();
    hostels.updateAttachmentLabel('a1', '7').subscribe();
    hostels.markAttachmentAsPrimary('a1').subscribe();
    expect(api.calls[0].body).toEqual({ attachment: { attachment_label_id: '7' } });
    expect(api.calls[1].body).toEqual({});
  });
});

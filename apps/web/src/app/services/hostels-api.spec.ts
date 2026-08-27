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

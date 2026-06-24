import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from './api-config';
import { ApiClient } from './api-resource';
import { provideDataAccess } from './provide-data-access';

describe('provideDataAccess', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideDataAccess({ baseUrl: 'https://api.test/v1' })],
    });
  });

  it('registers the API base config', () => {
    expect(TestBed.inject(API_CONFIG).baseUrl).toBe('https://api.test/v1');
  });

  it('wires HttpClient so ApiClient resolves', () => {
    expect(TestBed.inject(ApiClient)).toBeTruthy();
  });
});

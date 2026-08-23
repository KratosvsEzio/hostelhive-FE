import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideI18nTesting()],
    }).compileComponents();
  });

  it('creates the root app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

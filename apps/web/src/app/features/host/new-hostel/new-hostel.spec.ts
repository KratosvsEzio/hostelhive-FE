import { Component, forwardRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiError, HostelDetail, HostelInput } from '@hostelhive/data-access';
import { HostelsApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelForm } from '../hostel-form/hostel-form';
import { NewHostel } from './new-hostel';

/**
 * Stands in for the real form, which drags in maps, uploads and the whole hostel API.
 *
 * `viewChild.required(HostelForm)` queries by type, so the stub has to answer to that token —
 * hence the `useExisting` provider. What is under test is what `create()` does with the
 * result, not what the form collects.
 */
@Component({
  selector: 'hh-hostel-form',
  template: '',
  providers: [{ provide: HostelForm, useExisting: forwardRef(() => StubHostelForm) }],
})
class StubHostelForm {
  readonly valid = signal(true);
  readonly isValid = () => this.valid();
  readonly uploading = () => false;
  getPayload(): HostelInput {
    return { name: 'Test Hostel' } as HostelInput;
  }
}

/** The component's members are `protected`; the spec drives them through this shape. */
interface NewHostelInternals {
  create(): void;
  saving(): boolean;
  apiErrors(): string[];
  showValidationModal(): boolean;
}

describe('NewHostel', () => {
  let fixture: ComponentFixture<NewHostel>;
  let navigated: unknown[][];
  let created: HostelInput[];
  let response: () => Observable<HostelDetail>;

  beforeEach(async () => {
    navigated = [];
    created = [];
    response = () => of({ id: 'nHelLt', name: 'Test Hostel' } as unknown as HostelDetail);

    await TestBed.configureTestingModule({
      imports: [NewHostel],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        {
          provide: HostelsApi,
          useValue: {
            create: (input: HostelInput) => {
              created.push(input);
              return response();
            },
          },
        },
      ],
    })
      // The page chrome is not what `create()` is about, and pulling it in would drag the
      // dashboard shell into a test of one navigation.
      .overrideComponent(NewHostel, {
        set: { template: '<hh-hostel-form />', imports: [StubHostelForm] },
      })
      .compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation((commands: unknown[]) => {
      navigated.push(commands);
      return Promise.resolve(true);
    });

    fixture = TestBed.createComponent(NewHostel);
    fixture.detectChanges();
  });

  function internals(): NewHostelInternals {
    return fixture.componentInstance as unknown as NewHostelInternals;
  }

  function form(): StubHostelForm {
    return TestBed.inject(Router) && fixture.debugElement.children[0].componentInstance;
  }

  it('lands the host on the new hostel’s plans, not its profile', () => {
    internals().create();

    // A hostel is created without a subscription, and every console page but two bounces back
    // here until it has one — so the plans page is the only useful place to arrive.
    expect(navigated).toEqual([['/host', 'nHelLt', 'subscription']]);
  });

  it('does not navigate when the form is incomplete', () => {
    form().valid.set(false);

    internals().create();

    expect(created).toEqual([]);
    expect(navigated).toEqual([]);
    expect(internals().showValidationModal()).toBe(true);
  });

  it('stays put and says why when the create fails', () => {
    response = () =>
      throwError(() => ({ serverMessages: ['Name has already been taken'] }) as ApiError);

    internals().create();

    expect(navigated).toEqual([]);
    expect(internals().apiErrors()).toEqual(['Name has already been taken']);
    expect(internals().saving()).toBe(false);
  });
});

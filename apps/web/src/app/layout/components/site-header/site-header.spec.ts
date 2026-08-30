import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SessionStore } from '@core/auth';
import { MobileApp } from '@core/mobile-app';
import { ConsoleDrawer, FULL_WIDTH, RAIL_WIDTH } from '../console-drawer/console-drawer';
import { SiteHeader } from './site-header';

/** The component's members are `protected`; the spec reads them through this shape. */
interface SiteHeaderInternals {
  hasConsoleSidebar(): boolean;
  sidebarInset(): string;
}

describe('SiteHeader beside a console sidebar', () => {
  let fixture: ComponentFixture<SiteHeader>;
  let router: Router;
  let mobile: MobileApp;
  let drawer: ConsoleDrawer;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [
        // Everything resolves: the header only cares what the URL says, not what it renders.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: SessionStore,
          useValue: { role: signal(null), isAuthenticated: signal(false) },
        },
      ],
    })
      // The bar's own markup is not what this is about, and it would pull in the search bar,
      // the account menu and the notification bell to find out where it starts.
      .overrideComponent(SiteHeader, { set: { template: '' } })
      .compileComponents();

    router = TestBed.inject(Router);
    mobile = TestBed.inject(MobileApp);
    drawer = TestBed.inject(ConsoleDrawer);
    fixture = TestBed.createComponent(SiteHeader);
    fixture.detectChanges();
  });

  function header(): SiteHeaderInternals {
    return fixture.componentInstance as unknown as SiteHeaderInternals;
  }

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
  }

  it('starts where the sidebar ends, in each console', async () => {
    for (const url of ['/host/nHelLt/overview', '/moderator/queue', '/admin/users']) {
      await go(url);
      expect(header().hasConsoleSidebar()).toBe(true);
      expect(header().sidebarInset()).toBe(RAIL_WIDTH);
    }
  });

  it('travels with the rail when it expands', async () => {
    await go('/host/nHelLt/overview');
    expect(header().sidebarInset()).toBe(RAIL_WIDTH);

    drawer.toggleRail();
    fixture.detectChanges();

    expect(header().sidebarInset()).toBe(FULL_WIDTH);
    drawer.toggleRail(); // the width is remembered across visits — put it back
  });

  it('spans the width on the site itself', async () => {
    await go('/hostels/lahore');

    expect(header().hasConsoleSidebar()).toBe(false);
    expect(header().sidebarInset()).toBe('0px');
  });

  it('is not inset by a listing page that merely starts with "host"', async () => {
    // `/hostel/:id` is a public page sharing five letters with the console — the trap
    // `areaOf` exists to close, and an inset here would be a gap down the left of it.
    await go('/hostel/nHelLt');

    expect(header().hasConsoleSidebar()).toBe(false);
    expect(header().sidebarInset()).toBe('0px');
  });

  it('spans the width on the phone, where the sidebar gives way to the tab bar', async () => {
    await go('/host/nHelLt/overview');
    mobile.isMobile.set(true);
    fixture.detectChanges();

    // Same condition the shells render their <aside> on, so the two cannot disagree.
    expect(header().hasConsoleSidebar()).toBe(false);
    expect(header().sidebarInset()).toBe('0px');
  });
});

import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

/**
 * jsdom implements no layout, so it ships no `ResizeObserver`.
 *
 * Code that measures an element before drawing constructs one — `whenSized` in
 * @hostelhive/maps, which the location picker calls before handing a container to
 * Leaflet. Without this the constructor throws inside a Promise executor, which nothing
 * awaits, so it lands as an unhandled rejection: the run exits non-zero while every test
 * passes, and the message points at Leaflet rather than at the missing global.
 *
 * The stub never emits, which is faithful rather than lazy — jsdom reports every box as
 * 0×0, so a real implementation would have no size change to report either. Callers that
 * wait for a non-zero box fall through to their own timeout and degrade exactly as they
 * would against a permanently hidden element in a browser.
 */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

setupTestBed();

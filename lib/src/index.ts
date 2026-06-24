// HostelHive shared library — a single Nx project of cross-cutting building blocks.
//
// Import the granular entry points directly rather than from this aggregate barrel:
//   @hostelhive/ui  @hostelhive/styles  @hostelhive/data-access
//   @hostelhive/util  @hostelhive/maps
//
// App-specific code now lives in the app via relative imports: feature modules at
// apps/web/src/app/features/* and auth (session, guards, roles) at app/core/auth.
export {};

// HostelHive data-access — shared API contract: typed models exchanged with the backend.
// All runtime/DI wiring built on these lives in the app: API base config + tokens + ApiClient +
// provideDataAccess (apps/web/src/app/core), the API services (app/services), HTTP interceptors
// (app/core/interceptors), and the FavoritesStore (app/util). Typed OpenAPI SDK lands here at Q-API (§0).

export * from './lib/models/api-error';
export * from './lib/models/paginated';
export * from './lib/models/listing';
export * from './lib/models/auth';
export * from './lib/models/hostel';
export * from './lib/models/user';
export * from './lib/models/offer';
export * from './lib/models/admin';
export * from './lib/models/analytics';
export * from './lib/models/host';
export * from './lib/models/host-ops';
export * from './lib/models/moderation';
export * from './lib/models/subscription';
export * from './lib/models/product';

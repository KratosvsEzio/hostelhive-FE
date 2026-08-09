// HostelHive API services — typed service classes over the data-access ApiClient.
// They live in the app (not the shared lib) since they model app-specific endpoints;
// the shared HTTP plumbing (ApiClient, config, tokens, models) stays in @hostelhive/data-access.
export * from './auth-api';
export * from './documents-api';
export * from './hostels-api';
export * from './listings-api';
export * from './offers-api';
export * from './users-api';
export * from './admin-api';
export * from './analytics-api';
export * from './host-property-store';
export * from './host-ops-api';
export * from './host-shell-api';
export * from './listing-detail-api';
export * from './moderation-api';
export * from './subscription-api';
export * from './products-api';
export * from './image-upload.service';
export * from './google-auth.service';
export * from './search-capacity';
export * from './student-api';

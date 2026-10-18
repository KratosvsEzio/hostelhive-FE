import { HostelPropertyType, PROPERTY_TYPES } from '@hostelhive/data-access';

/**
 * Whether this is one of the property-type slugs the search can filter by.
 *
 * Case-sensitive, because the index matches the slug exactly: `Apartment` finds nothing, so a
 * link that carries it would empty the list rather than narrow it.
 */
export function isPropertyType(value: unknown): value is HostelPropertyType {
  return PROPERTY_TYPES.some((type) => type.value === value);
}

import { FilterGroup, FilterOption } from '@hostelhive/ui';

/**
 * Builds the FilterPanel group config for the Invoices list.
 *
 * @param hostelId   - Active hostel ID used to scope API URLs.
 * @param statusOptions - Status options loaded from the invoices API response.
 * @param renterBills - Whether the hostel bills renters (anything but nightly). Off, the
 *                      rental/utility type group and the tenant group are left out: a nightly
 *                      hostel bills bookings only, which have no type to choose between and no
 *                      `renter.id` for the tenant filter to match.
 */
export function invoiceFilterGroups(
  hostelId: string,
  statusOptions: FilterOption[],
  baseUrl: string,
  renterBills = true,
): FilterGroup[] {
  const groups: FilterGroup[] = [
    {
      key: 'status',
      label: 'Status',
      icon: 'ti-filter',
      fields: [
        {
          key: 'status',
          type: 'radio',
          label: 'Invoice status',
          description: 'Filter by payment status.',
          allValue: 'all',
          options: [{ value: 'all', label: 'All' }, ...statusOptions],
        },
      ],
    },
    {
      key: 'kind',
      label: 'Invoice Type',
      icon: 'ti-file-invoice',
      fields: [
        {
          key: 'kind',
          type: 'radio',
          label: 'Bill type',
          allValue: 'all',
          options: [
            { value: 'all', label: 'All' },
            { value: 'rental', label: 'Rental' },
            { value: 'utility', label: 'Utility' },
          ],
        },
      ],
    },
    {
      key: 'room',
      label: 'Room',
      icon: 'ti-door',
      fields: [
        {
          key: 'room',
          type: 'select',
          label: 'Room',
          placeholder: 'Search rooms…',
          apiUrl: `${baseUrl}/api/host/hostels/${hostelId}/rooms`,
          apiSearchParam: 'f[room_number]',
          apiResultsKey: 'rooms',
          apiLabelKey: 'room_number',
          apiValueKey: 'id',
        },
      ],
    },
    {
      key: 'tenant',
      label: 'Tenant',
      icon: 'ti-user',
      fields: [
        {
          key: 'tenant',
          type: 'select',
          label: 'Tenant',
          placeholder: 'Search tenants…',
          apiUrl: `${baseUrl}/api/host/hostels/${hostelId}/renters`,
          apiSearchParam: 'q',
          apiResultsKey: 'renters',
          apiLabelKey: 'full_name',
          apiValueKey: 'id',
        },
      ],
    },
    {
      key: 'date',
      label: 'Date Range',
      icon: 'ti-calendar',
      fields: [
        {
          key: 'date',
          type: 'date-range',
          label: 'Issue date',
          fromLabel: 'From',
          toLabel: 'To',
        },
      ],
    },
  ];
  return renterBills ? groups : groups.filter((g) => g.key !== 'kind' && g.key !== 'tenant');
}

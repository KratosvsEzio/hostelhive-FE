import { FilterGroup, FilterOption } from '@hostelhive/ui';

export function utilityFilterGroups(
  hostelId: string,
  statusOptions: FilterOption[],
  baseUrl: string,
): FilterGroup[] {
  return [
    {
      key: 'status',
      label: 'Status',
      icon: 'ti-filter',
      fields: [
        {
          key: 'status',
          type: 'radio',
          label: 'Bill status',
          allValue: 'all',
          options: [{ value: 'all', label: 'All' }, ...statusOptions],
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
}

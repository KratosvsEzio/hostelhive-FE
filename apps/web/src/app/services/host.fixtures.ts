import { HostListingsData, HostTeamData } from '@hostelhive/data-access';

/** Fixture for the host listings screen (mirrors design-mockups/10-host-listings.html). */
export const HOST_LISTINGS: HostListingsData = {
  stats: { total: 2, published: 1, inReview: 1, occupancy: 78 },
  listings: [
    {
      id: 'lst-almadina',
      name: 'Al-Madina Boys Hostel',
      area: 'DHA Phase 6',
      city: 'Karachi',
      accommodationType: 'boys',
      status: 'published',
      image: 'https://picsum.photos/seed/hhl1/240/180',
      rooms: 8,
      bedsFilled: 19,
      bedsTotal: 24,
      views: 1204,
    },
    {
      id: 'lst-citynest',
      name: 'City Nest PG',
      area: 'Gulshan-e-Iqbal',
      city: 'Karachi',
      accommodationType: 'coliving',
      status: 'in-review',
      image: 'https://picsum.photos/seed/hhl2/240/180',
      submittedAt: '2 days ago',
      photos: 12,
    },
  ],
  draft: {
    step: 3,
    totalSteps: 5,
    stepLabel: 'Media upload',
    savedAt: '5 min ago',
  },
};

/** Fixture for the host team screen (mirrors design-mockups/19-host-team.html). */
export const HOST_TEAM: HostTeamData = {
  property: { id: 'lst-almadina', name: 'Al-Madina Boys Hostel' },
  staff: [
    {
      id: 'stf-farhan',
      name: 'Farhan Ahmed',
      initials: 'FA',
      role: 'manager',
      email: 'farhan@email.com',
      phone: '+92 321 4455667',
      status: 'active',
      tone: 'cream',
    },
    {
      id: 'stf-rashid',
      name: 'Rashid Baig',
      initials: 'RB',
      role: 'warden',
      email: 'rashid@email.com',
      phone: '+92 300 1122334',
      status: 'active',
      tone: 'sky',
    },
    {
      id: 'stf-nadia',
      name: 'Nadia Khan',
      initials: 'NK',
      role: 'warden',
      email: 'nadia@email.com',
      status: 'inactive',
      tone: 'mint',
    },
  ],
};

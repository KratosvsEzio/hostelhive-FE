import { Route } from '@angular/router';
import { OnboardingWizard } from './onboarding-wizard/onboarding-wizard';

export const ONBOARDING_ROUTES: Route[] = [
  {
    path: '',
    component: OnboardingWizard,
    title: 'List your hostel — HostelHive',
  },
];

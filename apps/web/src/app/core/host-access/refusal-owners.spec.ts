import { ApiError } from '@hostelhive/data-access';
import {
  REFUSAL_KINDS,
  RefusalKind,
  SUBSCRIBE_MESSAGE,
  interceptedError,
  refusalError,
} from '@app/testing/backend-refusals';
import {
  CRM_REQUIRED_CODE,
  CRM_REQUIRED_MESSAGE,
  HostAccessRefusal,
  classifyHostAccess,
  isCrmRequired,
  isPermissionRefusal,
} from './host-access';

const ROOMS_URL = 'https://api.test/api/host/hostels/Xk9pQ/rooms';
const REQUEST = { method: 'GET', url: ROOMS_URL };

/** What each of the three classifiers makes of one failure. */
interface Verdicts {
  permission: boolean;
  crm: boolean;
  access: HostAccessRefusal | null;
}

function verdicts(err: ApiError): Verdicts {
  return {
    permission: isPermissionRefusal(err),
    crm: isCrmRequired(err),
    access: classifyHostAccess(ROOMS_URL, err),
  };
}

const NO_OWNER: Verdicts = { permission: false, crm: false, access: null };
const PERMISSION: Verdicts = { ...NO_OWNER, permission: true };
const CRM: Verdicts = { ...NO_OWNER, crm: true, access: { hostelId: 'Xk9pQ', kind: 'crmRequired' } };
const INACTIVE: Verdicts = { ...NO_OWNER, access: { hostelId: 'Xk9pQ', kind: 'inactive' } };

/** Typed by kind, so a refusal added to the shared bodies cannot go without an owner here. */
const EXPECTED: Record<RefusalKind, Verdicts> = {
  permissionCanCan: PERMISSION,
  permissionRender403: PERMISSION,
  crmRequired: CRM,
  crmMessageOnly: CRM,
  inactive: INACTIVE,
  paymentRequired: NO_OWNER,
  rateLimited: NO_OWNER,
  notFound: NO_OWNER,
  unprocessable: NO_OWNER,
  serverError: NO_OWNER,
  network: NO_OWNER,
};

describe('who owns each refusal the backend sends', () => {
  it('has an expectation for every refusal', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...REFUSAL_KINDS].sort());
  });

  it.each(REFUSAL_KINDS)('reads a %s failure as exactly its own kind of refusal, or none', (kind) => {
    expect(verdicts(refusalError(kind, REQUEST))).toEqual(EXPECTED[kind]);
  });
});

describe('a failure with more than one reading', () => {
  const owners = (err: ApiError): number =>
    [isPermissionRefusal(err), isCrmRequired(err)].filter(Boolean).length;

  const SUBSCRIBE_403 = { success: false, errors: [SUBSCRIBE_MESSAGE] };

  /** The 403s the backend never sends but a proxy, a future route or a changed message could. */
  const ODD_403s: [string, ApiError][] = [
    ['a 403 saying to subscribe', interceptedError(403, SUBSCRIBE_403, REQUEST)],
    [
      'a plan 403 saying to subscribe',
      interceptedError(403, { ...SUBSCRIBE_403, code: CRM_REQUIRED_CODE }, REQUEST),
    ],
    [
      'a 403 saying both to subscribe and that the plan has no CRM',
      interceptedError(403, { success: false, errors: [SUBSCRIBE_MESSAGE, CRM_REQUIRED_MESSAGE] }, REQUEST),
    ],
    [
      "the rate limiter's 403 saying to subscribe",
      interceptedError(403, { ...SUBSCRIBE_403, code: 'forbidden' }, REQUEST),
    ],
    ['a 403 with no body', interceptedError(403, null, REQUEST)],
    ['a 403 whose body is text', interceptedError(403, 'Forbidden', REQUEST)],
  ];

  const ALL: [string, ApiError][] = [
    ...REFUSAL_KINDS.map((kind): [string, ApiError] => [kind, refusalError(kind, REQUEST)]),
    ...ODD_403s,
  ];

  it.each(ALL)('gives %s at most one of the permission and CRM readings', (_, err) => {
    expect(owners(err)).toBeLessThanOrEqual(1);
  });
});

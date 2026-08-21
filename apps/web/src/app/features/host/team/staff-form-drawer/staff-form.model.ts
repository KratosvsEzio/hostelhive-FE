import { Staff } from '@hostelhive/data-access';
import { StaffWrite } from '@services';

/**
 * The staff drawer's form state.
 *
 * Every field is a string, including salary and the status id: an `<input>` yields strings,
 * and keeping the form in the shape the controls speak avoids a coercion pass on every
 * keystroke. Coercion happens once, at the payload boundary.
 */
export interface StaffForm {
  /** Present on edit, absent on create — this is what selects POST vs PATCH. */
  id?: string;
  name: string;
  title: string;
  phone: string;
  cnicNumber: string;
  address: string;
  salary: string;
  salaryIssueDate: string;
  joiningDate: string;
  leavingDate: string;

  /**
   * Grants this staff member a manager login for the hostel. The staff record itself has no
   * concept of a login, so turning this on additionally posts to the `add_manager` endpoint;
   * the two fields below are only read while it is on.
   */
  isManager: boolean;
  managerEmail: string;
  managerPassword: string;
  /** True when the record already had a manager login — the password is then optional. */
  wasManager: boolean;
  /**
   * The staff already has a login account (the API returned `user.id`). Manager access then
   * needs nothing but the flag — there are no credentials to collect, so the email and
   * password fields are shown disabled with a note rather than asked for again.
   */
  hasUserAccount: boolean;

  // Uploads. `*UploadId` is what gets sent; `*Url` is only for showing what is already
  // stored. The API returns CNIC images as bare URLs with no id, so an existing image can
  // be displayed but never re-sent — see `toUpdateStaffPayload`.
  avatarUploadId: string;
  avatarUrl: string;
  cnicFrontUploadId: string;
  cnicFrontUrl: string;
  cnicBackUploadId: string;
  cnicBackUrl: string;
}

const REQUIRED_FIELDS = [
  'name',
  'title',
  'phone',
  'joiningDate',
  'salary',
] as const satisfies readonly (keyof StaffForm)[];

type RequiredField = (typeof REQUIRED_FIELDS)[number];

/**
 * Local calendar date, not `toISOString()`. The latter is UTC and returns *yesterday* for
 * the first five hours of every day in PKT — same reasoning as the tenant form.
 */
function today(): string {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** A blank form for a new staff member, joining today. */
export function emptyStaffForm(): StaffForm {
  return {
    name: '',
    title: '',
    phone: '',
    cnicNumber: '',
    address: '',
    salary: '',
    salaryIssueDate: '',
    joiningDate: today(),
    leavingDate: '',
    // Manager access is always off until the host asks for it: the staff payload carries no
    // manager flag, so there is nothing to restore it from on edit.
    isManager: false,
    managerEmail: '',
    managerPassword: '',
    wasManager: false,
    hasUserAccount: false,
    avatarUploadId: '',
    avatarUrl: '',
    cnicFrontUploadId: '',
    cnicFrontUrl: '',
    cnicBackUploadId: '',
    cnicBackUrl: '',
  };
}

/** Seeds the form from an existing record for editing. */
export function staffFormFrom(s: Staff): StaffForm {
  return {
    id: s.id,
    name: s.name === '—' ? '' : s.name,
    title: s.title === '—' ? '' : s.title,
    phone: s.phone === '—' ? '' : s.phone,
    cnicNumber: s.cnic ?? '',
    address: s.address ?? '',
    // A zero salary is a real value and must survive the round trip; only absence blanks.
    salary: s.salary ? String(s.salary) : s.salary === 0 ? '0' : '',
    salaryIssueDate: s.salaryIssueDate ?? '',
    joiningDate: s.joiningDate ?? '',
    leavingDate: s.leavingDate ?? '',
    // Seeded from the record, so someone who already holds a login shows as a manager. The
    // API never returns the password, so that field stays blank and is only sent if the host
    // types a new one — `wasManager` is what makes it optional in that case.
    isManager: !!s.isManager,
    managerEmail: s.email ?? '',
    managerPassword: '',
    wasManager: !!s.isManager,
    hasUserAccount: !!s.userId,
    avatarUploadId: s.avatarId ?? '',
    avatarUrl: s.avatarUrl ?? '',
    cnicFrontUploadId: '',
    cnicFrontUrl: s.cnicFrontUrl ?? '',
    cnicBackUploadId: '',
    cnicBackUrl: s.cnicBackUrl ?? '',
  };
}

/** Deliberately permissive — the server is the authority on whether an address is real. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email problem while manager access is on; empty when it is off or the value is good. */
export function managerEmailError(f: StaffForm): string {
  // Nothing to validate when the account already exists — the field is disabled and the
  // address shown is whatever the API returned.
  if (!f.isManager || f.hasUserAccount) return '';
  const value = f.managerEmail.trim();
  if (!value) return 'Required.';
  return EMAIL_RE.test(value) ? '' : 'Enter a valid email address.';
}

/**
 * Password problem while manager access is on. Presence is only demanded when a login is
 * actually being created: an existing manager keeps their current password unless a new one
 * is typed, an existing user account has one already, and the API never returns it for us to
 * prefill. Never trimmed — spaces are legal in a password.
 */
export function managerPasswordError(f: StaffForm): string {
  if (!f.isManager || f.wasManager || f.hasUserAccount) return '';
  return f.managerPassword ? '' : 'Required.';
}

/**
 * Manager credentials for the staff payload, or nothing at all.
 *
 * Omitted entirely while the toggle is off, rather than sent as `is_manager: false`: a host
 * editing an ordinary field should never revoke someone's access as a side effect.
 *
 * When the staff already has a login account, only the flag is sent — the credentials exist
 * server-side and the form never collected them. Otherwise the password rides along only when
 * one was typed, so saving an existing manager's record leaves their current password alone.
 */
function managerFields(f: StaffForm): Pick<StaffWrite, 'email' | 'password' | 'is_manager'> {
  if (!f.isManager) return {};
  if (f.hasUserAccount) return { is_manager: true };
  return {
    is_manager: true,
    email: f.managerEmail.trim(),
    ...(f.managerPassword ? { password: f.managerPassword } : {}),
  };
}

/** True when every required field carries a non-blank value and the manager fields are sound. */
export function isStaffFormValid(f: StaffForm): boolean {
  return (
    REQUIRED_FIELDS.every((k: RequiredField) => !!f[k].trim()) &&
    !leavingBeforeJoining(f) &&
    !managerEmailError(f) &&
    !managerPasswordError(f)
  );
}

/**
 * A leaving date before the joining date. Plain string compare — both are `YYYY-MM-DD`,
 * which sorts lexicographically, so this needs no Date parsing and no timezone.
 */
export function leavingBeforeJoining(f: StaffForm): boolean {
  return !!f.joiningDate && !!f.leavingDate && f.leavingDate < f.joiningDate;
}

/** Blank optionals are omitted; a populated one is trimmed. */
function text(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

/**
 * Create sends neither `id` nor `status_id` — the server assigns both. Verified against
 * the live API: a POST without a status comes back with the record already set to Active.
 */
export function toCreateStaffPayload(f: StaffForm): StaffWrite {
  return {
    name: f.name.trim(),
    title: f.title.trim(),
    phone: f.phone.trim(),
    joining_date: f.joiningDate,
    address: text(f.address),
    cnic_number: text(f.cnicNumber),
    salary: f.salary.trim() ? Number(f.salary) : undefined,
    salary_issue_date: text(f.salaryIssueDate),
    leaving_date: text(f.leavingDate),
    avatar_id: text(f.avatarUploadId),
    cnic_front_id: text(f.cnicFrontUploadId),
    cnic_back_id: text(f.cnicBackUploadId),
    ...managerFields(f),
  };
}

/**
 * PATCH is partial, which is what makes editing safe here.
 *
 * The image ids are sent **only when a new file was picked this session**. The API returns
 * CNIC images as URLs with no id, so there is nothing to re-send for an untouched one —
 * omitting the key leaves the stored attachment alone, whereas sending a blank would wipe it.
 *
 * Status is not writable from this form — the server owns it — so no `status_id` here
 * either, same as create.
 */
export function toUpdateStaffPayload(f: StaffForm): StaffWrite {
  return {
    name: f.name.trim(),
    title: f.title.trim(),
    phone: f.phone.trim(),
    joining_date: f.joiningDate,
    address: text(f.address),
    cnic_number: text(f.cnicNumber),
    salary: f.salary.trim() ? Number(f.salary) : undefined,
    salary_issue_date: text(f.salaryIssueDate),
    // Explicit null so clearing a leaving date actually persists, rather than the key
    // being dropped and the old value surviving.
    leaving_date: f.leavingDate.trim() ? f.leavingDate.trim() : null,
    avatar_id: text(f.avatarUploadId),
    cnic_front_id: text(f.cnicFrontUploadId),
    cnic_back_id: text(f.cnicBackUploadId),
    ...managerFields(f),
  };
}

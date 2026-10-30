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
   * Required on every staff record: the backend validates its presence and format
   * (`Staff` `validates :email`), whether or not the person is a manager. Fixed once stored;
   * see {@link hasStoredEmail}. It is also the manager login when access is granted.
   */
  email: string;

  /**
   * Grants this staff member a manager login for the hostel.
   *
   * Carried on the ordinary staff payload as `is_manager` — see {@link managerFields} — not
   * by a second request. An earlier design posted to a separate `add_manager` endpoint; the
   * backend has since removed it.
   *
   * Worth knowing rather than buried: because the grant rides the staff write, whoever may
   * save a staff record may also hand out manager access. It is not separately gated on
   * either side of the wire.
   *
   * The password below is only read while this is on.
   */
  isManager: boolean;
  managerPassword: string;
  /** True when the record already had a manager login — the password is then optional. */
  wasManager: boolean;
  /**
   * The record arrived with an email, so the address is fixed and not sent again.
   *
   * Having an email is not the same as having an account: it is a plain column, while a
   * `User` appears only when manager access is first granted. The server looks the address
   * up (`Staff#validate_and_prepare_manager`) and reuses any account it finds; only when there
   * is none does it need a password. The form can't tell which, so for a stored address the
   * password is offered but optional, and sent only when typed.
   *
   * `user.id` would be the honest key for all this, but `StaffSerializer#user` returns
   * `{id: object.obfuscated_id}` — the staff's own id, sent for every record — so it is
   * always present and proves nothing. The address is the best evidence on the wire.
   */
  hasStoredEmail: boolean;

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
 * A blank form for a new staff member, joining today.
 *
 * @param today - The hostel's `yyyy-MM-dd` (`todayIn` with the hostel's zone), not the device's.
 */
export function emptyStaffForm(today: string): StaffForm {
  return {
    name: '',
    title: '',
    phone: '',
    cnicNumber: '',
    address: '',
    salary: '',
    salaryIssueDate: '',
    joiningDate: today,
    leavingDate: '',
    email: '',
    // Manager access is always off until the host asks for it: the staff payload carries no
    // manager flag, so there is nothing to restore it from on edit.
    isManager: false,
    managerPassword: '',
    wasManager: false,
    // A record being created has nothing stored yet, so the email is always asked for.
    hasStoredEmail: false,
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
    email: s.email ?? '',
    // Seeded from the record, so someone who already holds a login shows as a manager. The
    // API never returns the password, so that field stays blank and is only sent if the host
    // types a new one — `wasManager` is what makes it optional in that case.
    isManager: !!s.isManager,
    managerPassword: '',
    wasManager: !!s.isManager,
    hasStoredEmail: !!s.email,
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

/**
 * Email problem, manager or not.
 *
 * The backend rejects a staff record without a valid address ("Email can't be blank"), so it
 * is asked for on every create, and on an edit of an older record saved without one.
 * Nothing to validate once the record carries an address: the field is disabled and shows
 * what the API returned, so there is no input to be wrong.
 */
export function emailError(f: StaffForm): string {
  if (f.hasStoredEmail) return '';
  const value = f.email.trim();
  if (!value) return 'Required.';
  return EMAIL_RE.test(value) ? '' : 'Enter a valid email address.';
}

/**
 * Password problem while manager access is on.
 *
 * Demanded only when a login is certainly being created from scratch: no stored address and
 * no manager role already. With a stored address there may or may not be an account (see
 * {@link StaffForm.hasStoredEmail}), so the password is optional; with an existing manager the
 * current password stands unless a new one is typed. The API never returns it to prefill.
 *
 * Never trimmed — spaces are legal in a password.
 */
export function managerPasswordError(f: StaffForm): string {
  if (!f.isManager || f.hasStoredEmail || f.wasManager) return '';
  return f.managerPassword ? '' : 'Required.';
}

/** The address for the payload, sent only while it is not yet stored; a stored one is fixed. */
function emailField(f: StaffForm): Pick<StaffWrite, 'email'> {
  return f.hasStoredEmail ? {} : { email: f.email.trim() };
}

/**
 * Manager access for the staff payload, or nothing at all.
 *
 * Omitted entirely while the toggle is off, rather than sent as `is_manager: false`: a host
 * editing an ordinary field should never revoke someone's access as a side effect.
 *
 * The login is the staff's own email ({@link emailField}). The password rides along only when
 * one was typed. A blank field means leave it alone, so saving an existing manager's record
 * does not disturb their password.
 */
function managerFields(f: StaffForm): Pick<StaffWrite, 'password' | 'is_manager'> {
  if (!f.isManager) return {};
  return {
    is_manager: true,
    ...(f.managerPassword ? { password: f.managerPassword } : {}),
  };
}

/** True when every required field carries a non-blank value and the email and manager fields are sound. */
export function isStaffFormValid(f: StaffForm): boolean {
  return (
    REQUIRED_FIELDS.every((k: RequiredField) => !!f[k].trim()) &&
    !leavingBeforeJoining(f) &&
    !emailError(f) &&
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
    ...emailField(f),
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
    ...emailField(f),
    ...managerFields(f),
  };
}

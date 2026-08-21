import { Permission } from './roles';

/**
 * Which API surface a permission belongs to. The backend groups by the controller namespace,
 * so the same subject can carry different actions in each: `core` is `/api/…` (a hostel is
 * created there) and `host` is `/api/host/…` (a hostel is only listed and shown there).
 */
export type PermissionGroup = 'core' | 'host';

/** One granted action, exactly as `/api/users/current` sends it. */
export interface ApiPermissionNode {
  name: string;
  subject_class: string;
  action: string;
  permission_group: string;
}

/**
 * A subject's entry in the payload.
 *
 * `parent` is the umbrella label for the group ("Manage Hostels") — NOT a grant. The proof is
 * in the payload itself: `host.Hostel` carries a `manage` parent while its children are only
 * `index` and `show`, and reading the parent as full access would hand out create/update that
 * the API never listed. `children` is therefore the authoritative set, and a subject with no
 * access arrives as `{ parent: null, children: [] }`.
 */
export interface ApiPermissionSubject {
  parent: ApiPermissionNode | null;
  children: ApiPermissionNode[];
}

/** `{ core: { Hostel: {...} }, host: { Room: {...} } }` */
export type ApiPermissions = Record<string, Record<string, ApiPermissionSubject>>;

/** The canonical flag: `host:Room:create`. */
export function permissionKey(
  group: string,
  subject: string,
  action: string,
): Permission {
  return `${group}:${subject}:${action}`;
}

/**
 * Flattens the nested payload into the flat flags the session store checks.
 *
 * Only `children` are collected — see {@link ApiPermissionSubject} for why the parent is a
 * label rather than a grant. Each node carries its own `permission_group`, so that is trusted
 * over the key it was filed under.
 */
export function flattenPermissions(
  permissions: ApiPermissions | null | undefined,
): Permission[] {
  if (!permissions) return [];
  const flags = new Set<Permission>();
  for (const [groupKey, subjects] of Object.entries(permissions)) {
    if (!subjects) continue;
    for (const [subjectKey, entry] of Object.entries(subjects)) {
      for (const node of entry?.children ?? []) {
        if (!node?.action) continue;
        flags.add(
          permissionKey(
            node.permission_group || groupKey,
            node.subject_class || subjectKey,
            node.action,
          ),
        );
      }
    }
  }
  return [...flags];
}

/**
 * Whether `flag` is covered by the granted set.
 *
 * A granted `manage` covers every action on that subject, so a future payload that hands out
 * the umbrella instead of enumerating actions still works. Malformed flags fall back to an
 * exact match rather than throwing.
 */
export function permissionGranted(
  granted: ReadonlySet<Permission>,
  flag: Permission,
): boolean {
  if (granted.has(flag)) return true;
  const parts = flag.split(':');
  if (parts.length !== 3) return false;
  const [group, subject] = parts;
  return granted.has(permissionKey(group, subject, 'manage'));
}

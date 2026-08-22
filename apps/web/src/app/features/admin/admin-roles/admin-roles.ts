import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  toSignal,
  toObservable,
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';
import { format, parseISO } from 'date-fns';
import { Button, Card, ErrorState, Input, Skeleton } from '@hostelhive/ui';
import { AdminApi } from '@services';
import {
  PermissionFlag,
  PermissionGroup,
  RoleDef,
  RoleId,
} from '@hostelhive/data-access';
import { AdminShell } from '@features/admin/admin-shell/admin-shell';
import { isNetworkError } from '@util/network-error';

interface RolesData {
  roles: RoleDef[];
  groups: PermissionGroup[];
}
interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: RolesData | null;
}

/**
 * Roles & permissions (mockup 26). A role list on the left drives an interactive
 * permission matrix on the right. State is signal-based: `selectedRoleId` + a
 * `role → flag-set` working map (`draftFlags`) that toggling check cells mutates.
 * "New role" appends a blank custom role to the working set.
 */
@Component({
  selector: 'hh-admin-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminShell, Card, Button, Input, ErrorState, Skeleton],
  templateUrl: './admin-roles.html',
})
export class AdminRoles {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /* ---- reactive data (loading/error/data), mirrors SearchResults ---- */
  private readonly refresh = signal(0);
  protected readonly state = toSignal(
    // Re-fires on every `refresh` bump — the initial load and each Retry.
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.api.roles().pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  /* ---- working set: role → enabled flags (mutated by the matrix) ---- */
  private readonly draftFlags = signal<Record<RoleId, Set<PermissionFlag>>>({});
  /** Saved (committed) overrides per role — keeps fixtures immutable + reactive. */
  private readonly savedFlags = signal<Record<RoleId, PermissionFlag[]>>({});
  /** Custom roles added in-session via "New role". */
  private readonly customRoles = signal<RoleDef[]>([]);
  /** Selected role id, mirrored in the URL as `?roleId=<id>` — shareable and survives reload.
   *  (`?role` is reserved for the dev auth seed in app.config, so we use a distinct key.) */
  private readonly roleParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('roleId'))),
    {
      initialValue: null,
    },
  );
  protected readonly selectedRoleId = computed<RoleId | null>(() =>
    this.roleParam(),
  );

  protected readonly creating = signal(false);
  protected readonly draftName = signal('');

  /** Save (PUT) in flight + last-save-failed flag, for the matrix footer button. */
  protected readonly saving = signal(false);
  protected readonly saveError = signal(false);

  protected readonly roles = computed<RoleDef[]>(() => [
    ...(this.state().data?.roles ?? []),
    ...this.customRoles(),
  ]);
  protected readonly groups = computed<PermissionGroup[]>(
    () => this.state().data?.groups ?? [],
  );
  private readonly allFlags = computed<PermissionFlag[]>(() =>
    this.groups().flatMap((g) => g.flags.map((f) => f.flag)),
  );
  /** flag → backend permission id, for building `permission_ids` on save. */
  private readonly flagToId = computed(() => {
    const m = new Map<PermissionFlag, number>();
    for (const g of this.groups()) {
      for (const f of g.flags)
        if (f.permissionId != null) m.set(f.flag, f.permissionId);
    }
    return m;
  });

  protected readonly selectedRole = computed<RoleDef | null>(() => {
    const id = this.selectedRoleId();
    return this.roles().find((r) => r.id === id) ?? null;
  });
  /** Super Admin ('all' flags) is read-only. */
  protected readonly locked = computed(
    () => this.selectedRole()?.flags === 'all',
  );

  /** The selected role's backend id — drives the lazy per-role permission fetch. */
  private readonly selectedApiId = computed(
    () => this.selectedRole()?.apiId ?? null,
  );

  /** Lazily fetch the selected role's assigned permissions (`GET /api/admin/roles/:id`), with a
   *  loading flag. switchMap cancels the previous role's request when the selection changes. */
  private readonly rolePerms = toSignal(
    toObservable(this.selectedApiId).pipe(
      switchMap((apiId) =>
        apiId == null
          ? of({ loading: false, flags: [] as PermissionFlag[] })
          : this.api.roleFlags(apiId).pipe(
              map((flags) => ({ loading: false, flags })),
              startWith({ loading: true, flags: [] as PermissionFlag[] }),
              catchError(() =>
                of({ loading: false, flags: [] as PermissionFlag[] }),
              ),
            ),
      ),
    ),
    { initialValue: { loading: false, flags: [] as PermissionFlag[] } },
  );
  /** True while the selected role's permissions are loading (drives the matrix skeleton). */
  protected readonly permsLoading = computed(() => this.rolePerms().loading);
  /** Placeholder rows for the matrix skeleton while a role's permissions load. */
  protected readonly skeletonRows = [1, 2, 3, 4];

  /** Expand a loaded flag set so an umbrella `manage` implies its subgroup's children: when a
   *  group's parent flag is present, every child flag in that group is treated as set too. The
   *  backend grants `manage` as a CanCanCan wildcard (it already authorises the children), so a
   *  role often carries only `manage` — this keeps the matrix honest, and on Save the children
   *  are persisted explicitly alongside `manage`. */
  private expandManage(flags: Iterable<PermissionFlag>): Set<PermissionFlag> {
    const set = new Set(flags);
    for (const g of this.groups()) {
      const parent = g.flags.find((f) => f.parent);
      if (parent && set.has(parent.flag)) {
        for (const f of g.flags) set.add(f.flag);
      }
    }
    return set;
  }

  /** The committed flag set for the selected role (baseline for dirty-check): a saved override,
   *  else the lazily-fetched assignments — with umbrella `manage` flags expanded to their children. */
  private readonly baseline = computed<Set<PermissionFlag>>(() => {
    const role = this.selectedRole();
    if (!role) return new Set();
    if (role.flags === 'all') return new Set(this.allFlags());
    return this.expandManage(
      this.savedFlags()[role.id] ?? this.rolePerms().flags,
    );
  });

  /** Current (possibly edited) flag set: draft overlay falls back to baseline. */
  private readonly current = computed<Set<PermissionFlag>>(() => {
    const id = this.selectedRoleId();
    if (id == null) return new Set();
    return this.draftFlags()[id] ?? this.baseline();
  });

  protected readonly dirty = computed(() => {
    const id = this.selectedRoleId();
    const draft = id == null ? undefined : this.draftFlags()[id];
    if (!draft) return false;
    const base = this.baseline();
    if (draft.size !== base.size) return true;
    for (const f of draft) if (!base.has(f)) return true;
    return false;
  });

  constructor() {
    // Default selection: once roles arrive, point the URL at a valid role. Covers a bare
    // /admin/roles (no ?roleId) and a stale/invalid id; replaceUrl so it adds no history entry.
    effect(() => {
      const roles = this.roles();
      if (!roles.length) return;
      const id = this.selectedRoleId();
      if (id == null || !roles.some((r) => r.id === id)) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { roleId: roles[0].id },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  protected select(id: RoleId): void {
    // Reflect the selection in the URL; the matrix reads selectedRoleId back from `?roleId`.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { roleId: id },
      queryParamsHandling: 'merge',
    });
  }

  protected isOn(flag: PermissionFlag): boolean {
    return this.current().has(flag);
  }

  protected toggleFlag(flag: PermissionFlag): void {
    if (this.locked()) return;
    const id = this.selectedRoleId();
    if (id == null) return;
    const group = this.groups().find((g) =>
      g.flags.some((f) => f.flag === flag),
    );
    const def = group?.flags.find((f) => f.flag === flag);
    const next = new Set(this.current());
    const turnOn = !next.has(flag);

    if (group && def?.parent) {
      // Parent ("manage"): cascade on/off to every permission in the group.
      for (const f of group.flags) {
        if (turnOn) next.add(f.flag);
        else next.delete(f.flag);
      }
    } else {
      if (turnOn) next.add(flag);
      else next.delete(flag);
      // Keep the umbrella parent in sync — checked only when every child is checked.
      const parent = group?.flags.find((f) => f.parent);
      if (group && parent) {
        const allChildrenOn = group.flags
          .filter((f) => !f.parent)
          .every((c) => next.has(c.flag));
        if (allChildrenOn) next.add(parent.flag);
        else next.delete(parent.flag);
      }
    }
    this.draftFlags.update((m) => ({ ...m, [id]: next }));
  }

  protected reset(): void {
    const id = this.selectedRoleId();
    if (id == null) return;
    this.draftFlags.update((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  /**
   * Persist the role's permissions — `PUT /api/admin/roles` with the ticked flags mapped to
   * backend permission ids. On success, commit the draft into the in-session overlay so the
   * matrix keeps showing the saved set; on failure, surface a retry hint.
   */
  protected save(): void {
    const role = this.selectedRole();
    if (!role || this.locked() || this.saving()) return;
    const roleId = role.id;
    const flags = [...this.current()];
    const idOf = this.flagToId();
    const permissionIds = flags
      .map((f) => idOf.get(f))
      .filter((n): n is number => n != null);
    this.saving.set(true);
    this.saveError.set(false);
    this.api
      .updateRolePermissions(role, permissionIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savedFlags.update((m) => ({ ...m, [roleId]: flags }));
          this.draftFlags.update((m) => {
            const next = { ...m };
            delete next[roleId];
            return next;
          });
          this.saving.set(false);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(true);
        },
      });
  }

  protected startCreate(): void {
    this.draftName.set('');
    this.creating.set(true);
  }
  protected cancelCreate(): void {
    this.creating.set(false);
  }
  protected confirmCreate(): void {
    const name = this.draftName().trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    this.customRoles.update((rs) => [
      ...rs,
      {
        id,
        name,
        scope: 'Custom role',
        kind: 'custom',
        description: 'Custom role — no permissions yet.',
        assigned: '0 users',
        flags: [],
      },
    ]);
    this.creating.set(false);
    this.select(id);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /* ---- presentation helpers ---- */
  protected roleBtnClass(id: RoleId): string {
    const base =
      'role-btn mb-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start transition';
    return id === this.selectedRoleId()
      ? `${base} bg-brand-50 ring-1 ring-brand-200`
      : `${base} hover:bg-ink-50`;
  }

  /** Role-list subtitle: the created date when available, else the slug/scope fallback. */
  protected roleMeta(role: RoleDef): string {
    if (role.createdAt) {
      try { return 'Added ' + format(parseISO(role.createdAt), 'd MMM yyyy'); } catch { /* fall through */ }
    }
    return role.scope;
  }

  protected tagClass(role: RoleDef): string {
    const base =
      'rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-600';
    return role.kind === 'custom'
      ? `${base} bg-tint-purple`
      : `${base} bg-ink-100`;
  }

  protected cellClass(flag: PermissionFlag): string {
    const base =
      'grid h-5 w-5 place-items-center rounded border-2 transition disabled:opacity-60';
    return this.isOn(flag)
      ? `${base} border-brand-500 bg-brand-500 text-white`
      : `${base} border-ink-300 text-transparent hover:border-brand-400`;
  }
}

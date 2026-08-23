import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, firstValueFrom, map, of, switchMap, take } from 'rxjs';
import { Button, DatePicker, Dropdown, DropdownOption } from '@hostelhive/ui';
import { MoneyInput } from '@app/shared/money-input/money-input';
import { format } from 'date-fns';
import { Breadcrumb, DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import {
  DocumentsApi,
  ExpenseDetail,
  ExpenseFormOptions,
  ExpenseInput,
  ExpenseItemInput,
  HostelsApi,
  HostPropertyStore,
} from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

interface DraftImage {
  id: string;
  /** Preview source — a data URL for new picks, or the remote S3 URL for existing receipts. */
  dataUrl: string;
  name: string;
  /** The raw file — absent for receipts already attached to the expense (edit mode). */
  file?: File;
  /** True while the presigned upload to S3 is in flight. */
  uploading: boolean;
  /** 0–100 upload progress. */
  progress: number;
  /** The document id returned by the presigned-url call — collected into `receipt_ids`. */
  receiptId?: string;
  /** True if the presigned/upload step failed. */
  error?: boolean;
  /** True if the remote preview image failed to load (unprocessed / gone). */
  broken?: boolean;
}

/** Default expense type for a mess-dashboard grocery entry. Every create/update example
 *  from the backend uses "groceries"; flip this if it should be "mess" instead. */
const DEFAULT_EXPENSE_TYPE = 'groceries';

const todayIso = (): string => format(new Date(), 'yyyy-MM-dd');

@Component({
  selector: 'hh-add-grocery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, LocaleLink, DashboardLayout, Button, Dropdown, DatePicker, MoneyInput, TranslocoPipe],
  templateUrl: './add-grocery.html',
})
export class AddGrocery {
  private readonly hostelsApi = inject(HostelsApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly propertyStore = inject(HostPropertyStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly todayIso = todayIso();

  /** Present when the form is opened as `/expenses/:expenseId/edit` → edit mode. */
  private readonly editId = this.route.snapshot.paramMap.get('expenseId');
  protected readonly isEdit = !!this.editId;
  /** In edit mode, true until the existing expense is fetched and the form pre-filled. */
  protected readonly loadingExpense = signal(this.isEdit);
  /** The fetched expense (edit mode) — its line items are echoed back on save. */
  private readonly loaded = signal<ExpenseDetail | null>(null);

  /** Breadcrumb trail — the parent section depends on where the form was opened from
   *  (the Expenses list or the Mess "Add grocery" shortcut), since both share this form. */
  protected readonly breadcrumbs: Breadcrumb[] = this.isEdit
    ? [{ label: 'Expenses', url: '../..' }, { label: 'Edit expense' }]
    : [
        {
          label: this.route.snapshot.parent?.routeConfig?.path === 'mess' ? 'Mess' : 'Expenses',
          url: '..',
        },
        { label: 'Add expense' },
      ];

  // ── Expense-type options from GET /expenses/new ─────────────────────────────
  private readonly formOptionsKey = computed(() =>
    this.propertyStore.properties().length > 0 ? this.propertyStore.selected() : '',
  );
  private readonly formOptions = toSignal(
    toObservable(this.formOptionsKey).pipe(
      switchMap((hostelId) => {
        const empty: ExpenseFormOptions = { expenseTypes: [], itemUnits: [] };
        if (!hostelId) return of(empty);
        return this.hostelsApi.expenseFormOptions(hostelId).pipe(catchError(() => of(empty)));
      }),
    ),
    { initialValue: { expenseTypes: [], itemUnits: [] } as ExpenseFormOptions },
  );

  /** 'mess' is excluded — it's the umbrella category, not a thing a host logs directly. */
  protected readonly expenseTypeOptions = computed<DropdownOption[]>(() =>
    this.formOptions()
      .expenseTypes.filter((t) => t.slug !== 'mess')
      .map((t) => ({ value: t.slug, label: t.name })),
  );

  /**
   * Set by the route when the form is opened somewhere the type is already decided (the
   * mess page). Empty from the expenses page, where picking the type is the point.
   */
  protected readonly lockedExpenseType: string =
    this.route.snapshot.data['lockedExpenseType'] ?? '';

  protected readonly expenseType = signal(this.lockedExpenseType || DEFAULT_EXPENSE_TYPE);
  protected readonly date = signal<string | null>(this.todayIso);
  protected readonly notes = signal('');
  protected readonly images = signal<DraftImage[]>([]);

  // ── save state ───────────────────────────────────────────────────────────
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  // ── amount ────────────────────────────────────────────────────────────────
  protected readonly billTotal = signal('');
  /** Set on the first save attempt — gates the required-field error messages. */
  protected readonly submitted = signal(false);

  protected readonly billTotalValue = computed(() => {
    const v = parseFloat(this.billTotal());
    return v > 0 ? v : 0;
  });

  // ── required-field validation (expense type · date · amount) ────────────────
  protected readonly expenseTypeError = computed(() =>
    this.submitted() && !this.expenseType() ? 'Select an expense type' : '',
  );
  protected readonly dateError = computed(() =>
    this.submitted() && !this.date() ? 'Pick an expense date' : '',
  );
  protected readonly amountError = computed(() =>
    this.submitted() && !(this.billTotalValue() > 0) ? 'Enter the total amount' : '',
  );

  /** True while a selected receipt image is still uploading — blocks save until done. */
  protected readonly uploadingReceipt = computed(() =>
    this.images().some((img) => img.uploading),
  );

  protected readonly canSave = computed(
    () =>
      !!this.expenseType() &&
      !!this.date() &&
      this.billTotalValue() > 0 &&
      !this.uploadingReceipt(),
  );

  constructor() {
    const editId = this.editId;
    if (!editId) return;
    // Edit mode: once the hostel is known, fetch the expense and pre-fill the form.
    toObservable(this.formOptionsKey)
      .pipe(
        filter((hostelId): hostelId is string => !!hostelId),
        take(1),
        switchMap((hostelId) =>
          this.hostelsApi.getExpense(hostelId, editId).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((exp) => {
        if (exp) {
          this.loaded.set(exp);
          this.expenseType.set(exp.expenseType || DEFAULT_EXPENSE_TYPE);
          this.date.set(exp.date ? exp.date.slice(0, 10) : this.todayIso);
          this.billTotal.set(exp.amount ? String(exp.amount) : '');
          this.notes.set(exp.notes ?? '');
          // Seed the grid with the already-attached receipts (removable, and combinable with
          // new picks). They carry their receiptId so they survive the round-trip on save.
          this.images.set(
            exp.receipts.map((r, i) => ({
              id: `existing-${i}`,
              dataUrl: r.url,
              name: 'Receipt',
              uploading: false,
              progress: 100,
              receiptId: r.id,
              broken: !r.url,
            })),
          );
        }
        this.loadingExpense.set(false);
      });
  }

  protected onExpenseTypeChange(v: string | string[] | null): void {
    if (typeof v === 'string') this.expenseType.set(v);
  }

  protected onNotesInput(e: Event): void {
    this.notes.set((e.target as HTMLTextAreaElement).value);
  }

  /** Reject a negative amount (typed or spun below zero) by clearing it. */
  protected onAmountChange(v: string): void {
    const n = parseFloat(v);
    this.billTotal.set(Number.isFinite(n) && n < 0 ? '' : v);
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    Array.from(input.files).forEach((file) => {
      const id = `${Date.now()}-${Math.random()}`;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        this.images.update((list) => [
          ...list,
          { id, dataUrl, name: file.name, file, uploading: true, progress: 0 },
        ]);
        // Upload the receipt to S3 as soon as it's picked (presigned-url + PUT), so the
        // receipt_id is ready by save time and the user sees upload progress.
        this.uploadReceipt(id, file);
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  /** Runs the two-step upload for one draft image and tracks its progress/result on the signal. */
  private uploadReceipt(id: string, file: File): void {
    this.documentsApi
      .presignedUrl(file.type, null, 'receipts')
      .pipe(
        switchMap((presigned) =>
          this.documentsApi
            .uploadToS3(presigned.url, file)
            .pipe(map((p) => ({ percent: p.percent, receiptId: presigned.id }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ percent, receiptId }) =>
          this.patchImage(id, { progress: percent, receiptId, uploading: percent < 100 }),
        error: () => this.patchImage(id, { uploading: false, error: true }),
      });
  }

  private patchImage(id: string, patch: Partial<DraftImage>): void {
    this.images.update((list) =>
      list.map((img) => (img.id === id ? { ...img, ...patch } : img)),
    );
  }

  protected removeImage(id: string): void {
    this.images.update((list) => list.filter((img) => img.id !== id));
  }

  /** A remote receipt preview (existing attachment) failed to load — show a placeholder. */
  protected onImageError(id: string): void {
    this.patchImage(id, { broken: true });
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const pickedDay = this.date();
    if (!pickedDay || !this.canSave() || this.saving()) return;

    const hostelId = this.propertyStore.selected();
    if (!hostelId) {
      this.saveError.set('No hostel selected.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    try {
      // Receipts are uploaded on selection (see uploadReceipt); collect every attached id.
      // On edit this includes the pre-loaded existing receipts (minus any the user removed).
      const receiptIds = this.images()
        .map((img) => img.receiptId)
        .filter((id): id is string => !!id);

      const existing = this.loaded();
      // Keep the original timestamp when the date is unchanged; else anchor the new day at noon.
      const expenseDate =
        this.editId && existing && existing.date.slice(0, 10) === pickedDay
          ? existing.date
          : railsTimestamp(pickedDay);

      const expense: ExpenseInput = {
        expense_type: this.expenseType(),
        amount: String(this.billTotalValue()),
        expense_date: expenseDate,
        notes: this.notes().trim(),
        // Always send on edit (so removing a receipt clears it); on create only when present.
        ...(this.editId || receiptIds.length ? { receipt_ids: receiptIds } : {}),
      };

      if (this.editId) {
        // Echo existing line items back so the update doesn't drop them (PUT uses `expense_items`).
        const items = existing?.items ?? [];
        if (items.length) {
          expense.expense_items = items.map<ExpenseItemInput>((it) => ({
            id: it.id,
            name: it.name,
            unit: it.unit,
            quantity: String(it.quantity),
            unit_price: String(it.unitPrice),
            total_price: String(it.totalPrice),
          }));
        }
        await firstValueFrom(this.hostelsApi.updateExpense(hostelId, this.editId, expense));
      } else {
        await firstValueFrom(this.hostelsApi.createExpense(hostelId, expense));
      }
      void this.router.navigate(['..'], { relativeTo: this.route });
    } catch {
      this.saveError.set(
        this.editId
          ? 'Could not update the expense. Please try again.'
          : 'Could not save the entry. Please try again.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}

/** Format a picked `yyyy-MM-dd` as the Rails timestamp the expenses API expects
 *  (e.g. "2026-07-30 12:00:00.000 +0500"), anchored at local noon to dodge DST edges. */
function railsTimestamp(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return format(new Date(y, mo - 1, d, 12, 0, 0), 'yyyy-MM-dd HH:mm:ss.SSS xx');
}

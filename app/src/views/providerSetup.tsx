import { useEffect, useState } from 'react';
import type { Dataset } from '../../../core/engine';
import { Badge, Field, Section } from '../components';
import { gbp, parseMoney } from '../format';
import { baselineFor, recalculate, sortRows } from '../providerLedger';
import { sheetNameForProviderKey } from '../billSheets';
import { recalculateTelco } from '../../../core/telco';
import { CONFIG } from './providers';
import {
  PROVIDER_LOGO_MAX_BYTES,
  PROVIDER_SETUP,
  buildProviderPlanEntries,
  buildProviderYearPlan,
  isProviderEnabled,
  mergeProviderPlanRows,
  newProviderData,
  providerAsset,
  providerBilling,
  providerBillingAmount,
  providerFieldProblem,
  providerLogo,
  providerPlanKind,
  providerYearPlanTotal,
  readProviderField,
  readProviderLogo,
  withoutProviderPlanRows,
  writeProviderField,
  type ProviderBilling,
  type ProviderFieldConfig,
  type ProviderSetupMeta,
} from '../providerSetup';

function ProviderFieldInput({
  field,
  value,
  onCommit,
  onError,
}: {
  field: ProviderFieldConfig;
  value: string;
  onCommit: (next: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const problem = providerFieldProblem(field, draft);
    if (problem) {
      setDraft(value);
      onError(problem);
      return;
    }
    if (draft !== value) onCommit(draft);
  };

  if (field.type === 'multiline') {
    return (
      <textarea
        className="input detail-input detail-textarea"
        aria-label={field.label}
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
    );
  }

  return (
    <input
      className="input detail-input"
      aria-label={field.label}
      type={field.type === 'date' ? 'date' : 'text'}
      inputMode={field.type === 'number' ? 'numeric' : field.type === 'url' ? 'url' : undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function MoneyInput({
  label,
  value,
  hint,
  onCommit,
}: {
  label: string;
  value: number;
  hint?: string;
  onCommit: (pence: number) => void;
}) {
  const [draft, setDraft] = useState(value ? (value / 100).toFixed(2) : '');
  useEffect(() => setDraft(value ? (value / 100).toFixed(2) : ''), [value]);

  const commit = () => {
    const next = parseMoney(draft);
    if (next !== value) onCommit(next);
  };

  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(value ? (value / 100).toFixed(2) : '');
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

function ProviderCard({
  meta,
  ds,
  update,
  notify,
}: {
  key?: string;
  meta: ProviderSetupMeta;
  ds: Dataset;
  update: (mutator: (dataset: Dataset) => void) => void;
  notify: (message: string) => void;
}) {
  const provider = ds.providers[meta.key];
  const enabled = isProviderEnabled(ds, meta.key);
  const customLogo = providerLogo(ds, meta.key);
  const preview = customLogo ?? (meta.defaultLogo ? providerAsset(meta.defaultLogo) : undefined);
  const label = typeof provider?.displayName === 'string' && provider.displayName.trim()
    ? provider.displayName.trim()
    : meta.name;
  const billing = providerBilling(provider);
  const plan = billing.recurring ? buildProviderYearPlan(ds.settings.targetYear, billing) : [];
  const planTotal = providerYearPlanTotal(plan);
  const asOfYear = Number(ds.settings.asOfDate.slice(0, 4));
  const asOfMonth = Number(ds.settings.asOfDate.slice(5, 7)) || 1;
  const planFromMonth = asOfYear === ds.settings.targetYear ? asOfMonth : 1;
  const remainingRows = providerPlanKind(meta.key) ? plan.filter((row) => row.month >= planFromMonth).length : 0;

  /**
   * A recurring provider owns one monthly bill, which is what turns the plan
   * into real figures in every open month. It is found by provider key, or by
   * name so an existing bill (for example Rent) is adopted rather than doubled.
   */
  const syncBill = (dataset: Dataset, next: ProviderBilling) => {
    const target = dataset.providers[meta.key];
    const name = (typeof target?.displayName === 'string' && target.displayName.trim()) || meta.name;
    const amount = providerBillingAmount(next);
    const bills = dataset.bills ?? (dataset.bills = []);
    const linked = bills.find((bill) => bill.providerKey === meta.key)
      ?? bills.find((bill) => bill.name.trim().toLowerCase() === name.toLowerCase());
    if (!next.recurring || !amount) {
      if (linked?.providerKey === meta.key) linked.active = false;
      return;
    }
    if (linked) {
      linked.providerKey = meta.key;
      linked.name = name;
      linked.amountPence = amount;
      linked.baseAmountPence = amount;
      linked.dueDay = next.paymentDay;
      linked.baseDueDay = next.paymentDay;
      linked.account = next.account;
      linked.linkedSheet = sheetNameForProviderKey(meta.key) ?? linked.linkedSheet;
      linked.active = true;
      return;
    }
    bills.push({
      name,
      amountPence: amount,
      dueDay: next.paymentDay,
      linkedSheet: sheetNameForProviderKey(meta.key) ?? '',
      account: next.account,
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: bills.length + 1,
      active: true,
      effectiveFrom: '',
      paymentMethod: 'Direct Debit',
      baseAmountPence: amount,
      baseDueDay: next.paymentDay,
      providerKey: meta.key,
    });
  };

  /**
   * Write the plan into the provider's own ledger so its page shows the same
   * months as setup: contract payment and bill figures for every month left in
   * the year. Only rows the plan created are updated or removed.
   */
  const syncPlan = (dataset: Dataset, target: any, next: ProviderBilling) => {
    const cfg = CONFIG[meta.key];
    if (!cfg) return;
    if (next.recurring) {
      target.monthlyPaymentPence = providerBillingAmount(next);
      target.paymentDay = next.paymentDay;
    }
    if (!providerPlanKind(meta.key)) return;
    const rows = (target[cfg.rowsKey] ?? []) as any[];
    const year = dataset.settings.targetYear;
    const asOf = dataset.settings.asOfDate;
    const fromMonth = Number(asOf.slice(0, 4)) === year ? Number(asOf.slice(5, 7)) || 1 : 1;
    const list = next.recurring
      ? (() => {
          const merged = rows.slice();
          mergeProviderPlanRows(merged, buildProviderPlanEntries(meta.key, year, next, fromMonth), cfg.monthly);
          return merged;
        })()
      : withoutProviderPlanRows(rows);
    target[cfg.rowsKey] = list;
    sortRows(list, cfg);
    const baseline = baselineFor(cfg, list, target.ledgerOpeningPence);
    if (typeof target.ledgerOpeningPence !== 'number') target.ledgerOpeningPence = baseline;
    recalculate(cfg, list, baseline);
    if (cfg.formula === 'telco') recalculateTelco(target, baseline);
  };

  const saveBilling = (patch: Partial<ProviderBilling>) => {
    update((dataset) => {
      const target = dataset.providers[meta.key];
      if (!target) return;
      const next = { ...providerBilling(target), ...patch };
      target.billing = next;
      syncBill(dataset, next);
      syncPlan(dataset, target, next);
    });
  };

  const add = () => {
    update((dataset) => {
      if (!dataset.providers[meta.key]) {
        const created = newProviderData(meta.key, dataset.settings.targetYear);
        if (created) dataset.providers[meta.key] = created;
      } else {
        dataset.providers[meta.key].enabled = true;
      }
    });
    notify(`${label} added to the menu`);
  };

  const remove = () => {
    if (!confirm(
      `Remove ${label} from the menu?\n\nThe ledger data is kept, and you can add ${label} back here at any time.`,
    )) return;
    update((dataset) => {
      if (dataset.providers[meta.key]) dataset.providers[meta.key].enabled = false;
    });
    notify(`${label} hidden — its ledger data was kept`);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await readProviderLogo(file);
      update((dataset) => {
        const target = dataset.providers[meta.key];
        if (target) target.logoData = data;
      });
      notify(`${label} logo updated`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That logo could not be read.');
    }
  };

  const clearLogo = () => {
    update((dataset) => {
      if (dataset.providers[meta.key]) delete dataset.providers[meta.key].logoData;
    });
    notify(`${label} logo reset`);
  };

  const setField = (field: ProviderFieldConfig, value: string) => {
    update((dataset) => {
      const target = dataset.providers[meta.key];
      if (!target) return;
      writeProviderField(target, field.key, value, field.type);
    });
  };

  return (
    <details className="provider-card">
      <summary>
        <span className="provider-card-id">
          <span className="provider-card-logo">
            {preview ? <img src={preview} alt="" /> : <span aria-hidden>{meta.icon}</span>}
          </span>
          <span>
            <strong>{label}</strong>
            <span className="muted small">{provider ? (enabled ? 'In the sidebar' : 'Hidden, data kept') : 'Not set up'}</span>
          </span>
        </span>
        <Badge tone={enabled ? 'green' : provider ? 'amber' : 'neutral'}>
          {enabled ? 'Active' : provider ? 'Hidden' : 'Add'}
        </Badge>
      </summary>

      <div className="provider-card-body">
        <div className="provider-card-actions">
          {enabled ? (
            <button className="btn ghost sm" type="button" onClick={remove}>Remove from menu</button>
          ) : (
            <button className="btn primary sm" type="button" onClick={add}>
              {provider ? 'Add back to menu' : 'Add provider'}
            </button>
          )}
          <label className="btn ghost sm provider-upload">
            Upload logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void upload(file);
              }}
            />
          </label>
          {customLogo && <button className="btn ghost sm" type="button" onClick={clearLogo}>Reset logo</button>}
          <span className="muted small">PNG, JPEG or WebP · up to {Math.round(PROVIDER_LOGO_MAX_BYTES / 1024)} KB</span>
        </div>

        {provider ? (
          <>
            <div className="form-grid provider-fields">
              <Field label="Name in the menu" hint={`Defaults to ${meta.name}`}>
                <input
                  className="input"
                  value={typeof provider.displayName === 'string' ? provider.displayName : ''}
                  placeholder={meta.name}
                  maxLength={40}
                  onChange={(event) => {
                    const value = event.target.value;
                    update((dataset) => {
                      if (dataset.providers[meta.key]) dataset.providers[meta.key].displayName = value;
                      syncBill(dataset, providerBilling(dataset.providers[meta.key]));
                    });
                  }}
                />
              </Field>
              {meta.fields.map((field) => (
                <Field key={field.key} label={field.label} hint={field.type === 'url' ? 'Full http or https address' : undefined}>
                  <ProviderFieldInput
                    field={field}
                    value={readProviderField(provider, field.key)}
                    onCommit={(next) => setField(field, next)}
                    onError={notify}
                  />
                </Field>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8, paddingTop: 4 }}>
              <div>
                <strong>Billing and year plan</strong>
                <div className="muted small">What the provider normally bills, what you normally pay and when it leaves</div>
              </div>
              <div className="form-grid provider-fields">
                <MoneyInput
                  label="Normal bill £"
                  hint="What the provider normally bills for the period"
                  value={billing.billPence}
                  onCommit={(billPence) => saveBilling({ billPence })}
                />
                <MoneyInput
                  label="Normal monthly payment £"
                  hint="What you normally pay; defaults to the bill"
                  value={billing.monthlyPence}
                  onCommit={(monthlyPence) => saveBilling({ monthlyPence })}
                />
                <Field label="Payment date" hint="Day of the month the payment leaves (1–28)">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={28}
                    aria-label="Payment date"
                    value={billing.paymentDay}
                    onChange={(event) => saveBilling({ paymentDay: Math.min(28, Math.max(1, Number(event.target.value) || 1)) })}
                  />
                </Field>
                <Field label="Paid from" hint="The account this provider's bill and plan leave from">
                  <select
                    className="select"
                    aria-label="Paid from account"
                    value={billing.account || ds.settings.primaryAccount || ds.accounts[0]?.name || ''}
                    onChange={(event) => saveBilling({ account: event.target.value })}
                  >
                    {ds.accounts.map((account) => <option key={account.name} value={account.name}>{account.name}</option>)}
                  </select>
                </Field>
                <Field label="Contract details" hint="Contract length, reference or anything you need to remember">
                  <textarea
                    className="input detail-input detail-textarea"
                    rows={2}
                    aria-label="Contract details"
                    value={billing.contractDetails}
                    onChange={(event) => saveBilling({ contractDetails: event.target.value })}
                  />
                </Field>
              </div>
              <label className="muted small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={billing.recurring}
                  onChange={(event) => saveBilling({ recurring: event.target.checked })}
                />
                Recurring — build this provider’s year plan
              </label>
              <div className="muted small">
                {billing.recurring
                  ? plan.length
                    ? `${plan.length} monthly payments of ${gbp(providerBillingAmount(billing))} · ${plan[0].date} to ${plan[11].date} · ${gbp(planTotal)} for ${ds.settings.targetYear}, paid from ${billing.account || ds.settings.primaryAccount || 'the main account'}. ${remainingRows ? `${remainingRows} ledger ${remainingRows === 1 ? 'row' : 'rows'} fill the ${meta.name} page and ` : ''}a linked bill keeps the bill run in step and posts to the transaction log on its due date.`
                    : 'Add a normal bill or a monthly payment to build the plan.'
                  : 'Off — nothing is scheduled. These details are still saved.'}
              </div>
            </div>
            <div className="muted small">
              These are the details shown in the provider’s account and detail sections. Ledger rows and payments stay
              on the provider page.
            </div>
          </>
        ) : (
          <div className="muted small">
            No {meta.name} ledger yet. Adding it creates a blank account you can fill in from the provider page.
          </div>
        )}
      </div>
    </details>
  );
}

export function ProviderSetupSection({
  ds,
  update,
  notify,
}: {
  ds: Dataset;
  update: (mutator: (dataset: Dataset) => void) => void;
  notify: (message: string) => void;
}) {
  const enabledCount = PROVIDER_SETUP.filter((meta) => isProviderEnabled(ds, meta.key)).length;
  return (
    <Section
      title="5. Providers you track"
      sub="Choose which provider ledgers appear, name them, upload your own logo and edit their details"
      actions={<Badge tone={enabledCount ? 'green' : 'neutral'}>{enabledCount} of {PROVIDER_SETUP.length} active</Badge>}
    >
      <div style={{ padding: 16 }}>
        <div className="notice info" style={{ marginBottom: 12 }}>
          Removing a provider only hides it and its sidebar entry — the ledger, payments and bills are kept.
          Logos and details sync with the budget, and headlines never replace the provider page’s own ledger.
        </div>
        <div className="provider-setup-grid">
          {PROVIDER_SETUP.map((meta) => (
            <ProviderCard key={meta.key} meta={meta} ds={ds} update={update} notify={notify} />
          ))}
        </div>
      </div>
    </Section>
  );
}

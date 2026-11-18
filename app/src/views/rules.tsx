import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { gbp, MONTH_LONG } from '../format';
import { normaliseCategory, normaliseTags } from '../../../core/categories';
import {
  RULE_FIELDS,
  RULE_OPERATORS,
  newRuleId,
  normaliseMerchant,
  ruleFieldText,
  rulePatternProblem,
  testRule,
  type ImportRule,
  type RuleField,
  type RuleOperator,
  type RuleTestResult,
} from '../../../core/importRules';

export function RulesView({ ds, update, notify }: ViewProps) {
  const rules = ds.importRules ?? [];
  const [draft, setDraft] = useState({
    field: 'description' as RuleField,
    operator: 'contains' as RuleOperator,
    pattern: '',
    priority: String((rules.at(-1)?.priority ?? 0) + 10),
    category: '',
    tags: '',
    targetAccount: '',
  });
  const [tests, setTests] = useState<Record<string, RuleTestResult>>({});
  const [sample, setSample] = useState('TESCO STORES 3245 12/11 CARD 1234');

  const operators = RULE_OPERATORS.filter((operator) => operator.fields.includes(draft.field));

  const add = () => {
    const pattern = draft.pattern.trim();
    if (!pattern) return notify('Enter what the rule should match');
    if (draft.operator === 'regex') {
      const problem = rulePatternProblem(pattern);
      if (problem) return notify(problem);
      try { new RegExp(pattern); } catch { return notify('That regular expression is not valid'); }
    }
    if (!normaliseCategory(draft.category) && normaliseTags(draft.tags).length === 0) {
      return notify('Give the rule a category or at least one tag');
    }
    const rule: ImportRule = {
      id: newRuleId(rules),
      field: draft.field,
      operator: draft.operator,
      pattern,
      priority: Number(draft.priority) || 0,
      category: normaliseCategory(draft.category) || undefined,
      tags: normaliseTags(draft.tags),
      targetAccount: draft.targetAccount || undefined,
      enabled: true,
    };
    update((dataset) => { dataset.importRules = [...(dataset.importRules ?? []), rule]; });
    notify(`Rule added: ${ruleFieldText(rule)}`);
    setDraft({ ...draft, pattern: '', category: '', tags: '' });
  };

  const patch = (id: string, change: (rule: ImportRule) => void) => {
    update((dataset) => {
      const rule = (dataset.importRules ?? []).find((entry) => entry.id === id);
      if (rule) change(rule);
    });
  };

  const remove = (rule: ImportRule) => {
    update((dataset) => { dataset.importRules = (dataset.importRules ?? []).filter((entry) => entry.id !== rule.id); });
    notify('Rule removed');
  };

  const runTest = (rule: ImportRule) => {
    setTests((current) => ({ ...current, [rule.id]: testRule(rule, ds.transactions, ds.settings.asOfDate) }));
  };

  return (
    <>
      <Section
        title="Import rules"
        sub="Rules only suggest a category and tags during import review. Nothing is written until you add the rows, and a rule can never change a balance or total."
      >
        <div className="notice info" style={{ margin: 16 }}>
          <strong>Money-safe by design.</strong> Rules set descriptive fields only. Treatment (Transfer or Refund) stays a manual
          per-row decision because it moves totals. The first enabled rule by priority wins; the rest are not merged.
        </div>

        <div className="asset-form">
          <Field label="Field">
            <select
              className="select"
              value={draft.field}
              onChange={(event) => {
                const field = event.target.value as RuleField;
                const nextOperators = RULE_OPERATORS.filter((operator) => operator.fields.includes(field));
                setDraft({ ...draft, field, operator: nextOperators[0].id });
              }}
            >
              {RULE_FIELDS.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select className="select" value={draft.operator} onChange={(event) => setDraft({ ...draft, operator: event.target.value as RuleOperator })}>
              {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.label}</option>)}
            </select>
          </Field>
          <Field label={draft.field === 'amount' ? 'Amount (pence)' : 'Pattern'} hint={draft.field === 'description' ? 'Matched against the normalised merchant name.' : undefined}>
            <input className="input" value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} placeholder={draft.field === 'amount' ? 'e.g. 5000' : 'e.g. TESCO'} />
          </Field>
          <Field label="Priority" hint="Lower runs first.">
            <input className="input" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} inputMode="numeric" />
          </Field>
          <Field label="Category">
            <input className="input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="e.g. Food" />
          </Field>
          <Field label="Tags" hint="Comma separated.">
            <input className="input" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="e.g. weekly, groceries" />
          </Field>
          <Field label="Import account (optional)">
            <select className="select" value={draft.targetAccount} onChange={(event) => setDraft({ ...draft, targetAccount: event.target.value })}>
              <option value="">Use the account chosen at import</option>
              {ds.accounts.map((account) => <option key={account.name} value={account.name}>{account.name}</option>)}
            </select>
          </Field>
          <button className="btn primary" type="button" onClick={add}>Add rule</button>
        </div>

        {rules.length === 0 ? <Empty>No rules yet. Add one above, then test it against your history.</Empty> : (
          <Table head={['Rule', 'Suggests', 'Priority', 'On', 'History', '']}>
            {rules.map((rule) => {
              const test = tests[rule.id];
              return (
                <tr key={rule.id}>
                  <td>
                    <strong>{ruleFieldText(rule)}</strong>
                    {rule.targetAccount && <div className="muted small">Imports into {rule.targetAccount}</div>}
                  </td>
                  <td>
                    <div className="rule-chips">
                      {rule.category && <Badge tone="blue">{rule.category}</Badge>}
                      {(rule.tags ?? []).map((tag) => <span key={tag}><Badge tone="amber">{tag}</Badge></span>)}
                    </div>
                  </td>
                  <td className="num">{rule.priority}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.enabled !== false}
                      aria-label={`Enable ${ruleFieldText(rule)}`}
                      onChange={(event) => patch(rule.id, (entry) => { entry.enabled = event.target.checked; })}
                    />
                  </td>
                  <td>
                    <button className="btn ghost sm" type="button" onClick={() => runTest(rule)}>Test</button>
                    {test && (
                      <div className="muted small">
                        {test.rows} match{test.rows === 1 ? '' : 'es'} · {gbp(test.expensePence)} out, {gbp(test.incomePence)} in
                      </div>
                    )}
                  </td>
                  <td><button className="btn danger sm" type="button" onClick={() => remove(rule)}>Remove</button></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Merchant normalisation" sub="Rules match the cleaned description, not the raw bank text.">
        <div className="asset-form">
          <Field label="Raw description">
            <input className="input" value={sample} onChange={(event) => setSample(event.target.value)} />
          </Field>
          <Field label="Normalised">
            <input className="input" value={normaliseMerchant(sample)} readOnly aria-readonly="true" />
          </Field>
        </div>
        <p className="muted small" style={{ padding: '0 16px 16px' }}>
          Card references, statement dates and reference numbers of four digits or more are removed. A name such as O2 stays intact.
        </p>
      </Section>

      <Section title="Where rules run" sub="Import review only">
        <p className="muted" style={{ padding: 16 }}>
          Rules suggest a category and tags in the import grid, with the matched rule named on every row. You can edit any
          suggestion before adding the rows. Manual entry and bank sync are untouched, so an existing habit cannot be
          rewritten by a new rule. {MONTH_LONG[new Date().getMonth()]} imports keep working the same way.
        </p>
      </Section>
    </>
  );
}

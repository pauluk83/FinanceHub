import type { ViewProps } from '../types';
import { Badge, Section, Table } from '../components';
import {
  NAV_GROUPS,
  STATIC_GROUP,
  defaultNavItems,
  effectiveGroup,
  navLayout,
  type NavGroup,
} from '../nav';

const MOVABLE_GROUPS = NAV_GROUPS.filter((group) => group !== STATIC_GROUP);

export function MenuLayoutSection({ ds, update, notify }: Pick<ViewProps, 'ds' | 'update' | 'notify'>) {
  const layout = navLayout(ds);
  const hidden = layout.hidden ?? [];
  const items = defaultNavItems(ds);
  const movable = items.filter((item) => item.group !== STATIC_GROUP);
  const fixed = items.filter((item) => item.group === STATIC_GROUP);
  const hiddenCount = movable.filter((item) => hidden.includes(item.id)).length;
  const movedCount = movable.filter((item) => effectiveGroup(item, layout) !== item.group).length;

  const toggleVisible = (id: string) => {
    update((dataset) => {
      const current = dataset.settings.navLayout?.hidden ?? [];
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      dataset.settings.navLayout = { ...dataset.settings.navLayout, hidden: next };
    });
  };

  const move = (id: string, target: NavGroup) => {
    update((dataset) => {
      const item = defaultNavItems(dataset).find((entry) => entry.id === id);
      const groups = { ...(dataset.settings.navLayout?.groups ?? {}) };
      if (!item || target === item.group) delete groups[id];
      else groups[id] = target;
      dataset.settings.navLayout = { ...dataset.settings.navLayout, groups };
    });
  };

  const showAll = () => {
    update((dataset) => {
      dataset.settings.navLayout = { ...dataset.settings.navLayout, hidden: [] };
    });
    notify('Every menu item is visible again');
  };

  const reset = () => {
    if (!confirm('Reset the sidebar layout? Every item returns to its default section and becomes visible. Tools is unchanged.')) return;
    update((dataset) => {
      delete dataset.settings.navLayout;
    });
    notify('Sidebar layout reset');
  };

  return (
    <Section
      title="Menu layout"
      sub="Choose what appears in the sidebar and which section it sits in. Tools always stays fixed."
      actions={<Badge tone={hiddenCount || movedCount ? 'amber' : 'green'}>{hiddenCount + movedCount ? `${hiddenCount} hidden · ${movedCount} moved` : 'Default layout'}</Badge>}
    >
      <div className="toolbar" style={{ borderBottom: 0 }}>
        <span className="muted small">
          Hidden items are also removed from the Ctrl+K palette. Moving an item keeps its place in the new section.
        </span>
        <div className="toolbar-spacer" />
        <button className="btn ghost sm" onClick={showAll} disabled={hiddenCount === 0}>Show all</button>
        <button className="btn ghost sm" onClick={reset} disabled={hiddenCount === 0 && movedCount === 0}>Reset layout</button>
      </div>

      <Table head={['Item', 'Section', 'Visible', 'Show under']}>
        {movable.map((item) => {
          const group = effectiveGroup(item, layout);
          return (
            <tr key={item.id}>
              <td>
                <strong><span className="nav-icon" aria-hidden>{item.icon}</span> {item.label}</strong>
                {group !== item.group && <div className="muted small">Moved from {item.group}</div>}
              </td>
              <td><Badge tone="neutral">{group}</Badge></td>
              <td>
                <input
                  type="checkbox"
                  checked={!hidden.includes(item.id)}
                  onChange={() => toggleVisible(item.id)}
                  aria-label={`Show ${item.label} in the sidebar`}
                />
              </td>
              <td>
                <select
                  className="select"
                  aria-label={`Section for ${item.label}`}
                  value={group}
                  onChange={(event) => move(item.id, event.target.value as NavGroup)}
                >
                  {MOVABLE_GROUPS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </td>
            </tr>
          );
        })}
      </Table>

      <div style={{ padding: '12px 16px 16px', display: 'grid', gap: 8 }}>
        <div className="muted small"><strong style={{ color: 'var(--text)' }}>Tools — fixed section.</strong> These items can’t be hidden or moved.</div>
        <div className="menu-fixed-list">
          {fixed.map((item) => (
            <span className="menu-fixed-item" key={item.id}>
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              {item.label}
              <Badge tone="neutral">Fixed</Badge>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

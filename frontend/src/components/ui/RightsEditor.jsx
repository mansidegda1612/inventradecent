/**
 * RightsEditor — grouped, chip-based permission picker (replaces the old raw
 * checkbox PermissionMatrix). Works on permission IDs (what userrole.rights /
 * user.rights store), sourced from the DB-backed catalog in AuthContext.
 *
 *   <RightsEditor value={ids} onChange={setIds} lockedIds={roleIds} />
 *
 * value:     number[]  currently-selected permission ids (editable set)
 * onChange:  (number[]) => void
 * disabled:  render read-only
 * lockedIds: number[]  ids that are always-on and not removable here — used in
 *            the user form to show the rights the chosen role already grants
 *            (so the admin only toggles *extra* rights on top). Rendered as
 *            filled+locked and excluded from value.
 */
import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";

export default function RightsEditor({ value = [], onChange, disabled = false, lockedIds = [] }) {
  const { permissions } = useAuth();
  const [query, setQuery] = useState("");

  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const selected = useMemo(() => new Set(value), [value]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return permissions;
    return permissions
      .map((g) => ({
        ...g,
        actions: g.actions.filter(
          (a) =>
            g.label.toLowerCase().includes(q) ||
            a.label.toLowerCase().includes(q) ||
            a.key.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.label.toLowerCase().includes(q) || g.actions.length);
  }, [permissions, query]);

  if (!permissions.length) {
    return <p className="u-muted u-fs12">Loading permission list…</p>;
  }

  const setValue = (next) => onChange(Array.from(next));

  const toggle = (id) => {
    if (disabled || locked.has(id)) return;
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setValue(next);
  };

  // A group's toggleable actions are those not locked by the role.
  const toggleModule = (group) => {
    if (disabled) return;
    const toggleable = group.actions.filter((a) => !locked.has(a.id)).map((a) => a.id);
    const allOn = toggleable.every((id) => selected.has(id));
    const next = new Set(selected);
    toggleable.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
    setValue(next);
  };

  const bulk = (on) => {
    if (disabled) return;
    if (!on) return setValue(new Set());
    const all = permissions.flatMap((g) => g.actions.map((a) => a.id)).filter((id) => !locked.has(id));
    setValue(new Set(all));
  };

  const isOn = (id) => locked.has(id) || selected.has(id);

  return (
    <div className="rights-editor">
      <div className="rights-editor-bar">
        <input
          className="rights-editor-search"
          placeholder="Search modules or actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!disabled && (
          <div className="rights-editor-bulk">
            <button type="button" onClick={() => bulk(true)}>Select all</button>
            <button type="button" onClick={() => bulk(false)}>Clear all</button>
          </div>
        )}
      </div>

      <div className="rights-editor-groups">
        {groups.map((group) => {
          const total = group.actions.length;
          const onCount = group.actions.filter((a) => isOn(a.id)).length;
          const allOn = onCount === total;
          return (
            <div key={group.module} className="rights-group">
              <div className="rights-group-head">
                <button
                  type="button"
                  className={`rights-group-toggle ${allOn ? "is-on" : onCount ? "is-partial" : ""}`}
                  onClick={() => toggleModule(group)}
                  disabled={disabled}
                  title={allOn ? "Clear this module" : "Select this module"}
                >
                  {group.label}
                </button>
                <span className="rights-group-count">{onCount}/{total}</span>
              </div>
              <div className="rights-group-actions">
                {group.actions.map((a) => {
                  const lockedOn = locked.has(a.id);
                  const on = isOn(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`rights-chip ${on ? "is-on" : ""} ${lockedOn ? "is-locked" : ""}`}
                      onClick={() => toggle(a.id)}
                      disabled={disabled || lockedOn}
                      title={lockedOn ? "Granted by the selected role" : undefined}
                    >
                      {on && <span className="rights-chip-tick">✓</span>}
                      {a.label}
                      {lockedOn && <span className="rights-chip-lock">🔒</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!groups.length && <p className="u-muted u-fs12">No permissions match “{query}”.</p>}
      </div>
    </div>
  );
}

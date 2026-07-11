/**
 * PermissionMatrix
 *
 * Grouped checkbox grid. The list of available permissions now comes from
 * AuthContext (fetched once from GET /api/permissions), not a static
 * frontend file — keeps a single source of truth on the backend.
 *
 *   <PermissionMatrix value={rights} onChange={setRights} />
 *
 * value: string[] of permission keys currently checked.
 * onChange: (string[]) => void
 * disabled: render read-only (e.g. viewer without roles.edit)
 */
import { useAuth } from "../../context/AuthContext";

export default function PermissionMatrix({ value = [], onChange, disabled = false }) {
  const { permissions } = useAuth();

  const isChecked = (key) => value.includes("*") || value.includes(key);

  const toggle = (key) => {
    if (disabled) return;
    if (value.includes(key)) onChange(value.filter(k => k !== key));
    else onChange([...value, key]);
  };

  const toggleModule = (group, checkAll) => {
    if (disabled) return;
    const keys = group.actions.map(a => a.key);
    if (checkAll) onChange(Array.from(new Set([...value, ...keys])));
    else onChange(value.filter(k => !keys.includes(k)));
  };

  const isModuleFullyChecked = (group) => group.actions.every(a => isChecked(a.key));

  if (!permissions.length) {
    return <p className="u-muted u-fs12">Loading permission list…</p>;
  }

  return (
    <div className="perm-matrix">
      {permissions.map((group) => {
        const fullyChecked = isModuleFullyChecked(group);
        return (
          <div key={group.module} className="perm-matrix-row">
            <label className="perm-matrix-module">
              <input
                type="checkbox"
                checked={fullyChecked}
                disabled={disabled}
                onChange={(e) => toggleModule(group, e.target.checked)}
              />
              <span>{group.label}</span>
            </label>
            <div className="perm-matrix-actions">
              {group.actions.map((a) => (
                <label key={a.key} className="perm-matrix-action">
                  <input
                    type="checkbox"
                    checked={isChecked(a.key)}
                    disabled={disabled}
                    onChange={() => toggle(a.key)}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { callAPI } from "../utils/callserver";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // {id, name, user_id, userrole, role_name, rights}
  const [company, setCompany] = useState(null);
  const [org, setOrg] = useState(null);         // active org: {id, name}
  const [orgs, setOrgs] = useState([]);         // every org this user can open: [{id, name}]
  const [subscription, setSubscription] = useState(null); // {status, trial_ends_at, current_period_end}
  const [permissions, setPermissions] = useState([]); // canonical list from GET /api/permissions
  const [ready, setReady] = useState(false);     // true once initial hydrate attempt is done

  // Fetched once per session — this is metadata about what permissions
  // *exist* (for rendering the rights matrix), not the current user's
  // own rights. It rarely changes, so no need to refetch on every render.
  const fetchPermissions = useCallback(async () => {
    try {
      const res = await callAPI("permissions", "GET");
      if (res.success) setPermissions(res.data || []);
    } catch {
      // non-fatal — RoleFormModal/UserFormModal just render an empty matrix
    }
  }, []);

  // Rehydrate from the token alone — never trust stale localStorage values
  // for rights, since a role could have changed since the last login.
  const hydrate = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { setReady(true); return; }
    try {
      const res = await callAPI("auth/me", "GET");
      if (res.success) {
        setUser(res.data.user);
        setCompany(res.data.company || null);
        setOrg(res.data.org || null);
        setOrgs(res.data.orgs || []);
        setSubscription(res.data.subscription || null);
        await fetchPermissions();
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
      }
    } catch {
      // network hiccup on load — leave token in place, callAPI's own 401 handling covers the rest
    } finally {
      setReady(true);
    }
  }, [fetchPermissions]);

  useEffect(() => { hydrate(); }, [hydrate]);

  const login = async (data) => {
    localStorage.setItem("token", data.accessToken);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    setUser(data.user);
    setOrg(data.org || null);
    setOrgs(data.orgs || []);
    setSubscription(data.subscription || null);
    await fetchPermissions();
  };

  const logout = () => {
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
    setCompany(null);
    setOrg(null);
    setOrgs([]);
    setSubscription(null);
    setPermissions([]);
  };

  // Mints a token scoped to a different org the user has access to (shown
  // via the header's org switcher, or when orgs.length > 1). Every page
  // that's already mounted (Dashboard, Products, ...) fetched its data
  // under the OLD org and has no reason to know the org just changed, so
  // rather than teaching every single page to re-fetch on org change, do a
  // full reload — same reset-everything approach forceLogout() already
  // uses in callserver.js, and just as reliable here.
  const switchOrg = async (orgId) => {
    const res = await callAPI("auth/switch-org", "POST", { org_id: orgId });
    if (res.success && res.data) {
      localStorage.setItem("token", res.data.accessToken);
      if (res.data.refreshToken) localStorage.setItem("refreshToken", res.data.refreshToken);
      window.location.reload();
    }
    return res;
  };

  const rights = user?.rights || [];

  const hasRight = useCallback((key) => {
    if (!key) return true;
    if (rights.includes("*")) return true;
    return rights.includes(key);
  }, [rights]);

  const hasAnyRight = useCallback((keys = []) => keys.some(hasRight), [hasRight]);

  return (
    <AuthContext.Provider
      value={{
        user, rights, company, setCompany, permissions, ready,
        org, orgs, switchOrg, subscription,
        login, logout, hasRight, hasAnyRight, refreshMe: hydrate,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

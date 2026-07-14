export const TOKEN_KEY  = "tac:token";
export const DEMO_KEY   = "tac:demo";

export const getToken   = () => localStorage.getItem(TOKEN_KEY);
export const setToken   = (t: string) => { localStorage.setItem(TOKEN_KEY, t); localStorage.removeItem(DEMO_KEY); };
export const clearToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(DEMO_KEY); };

export const isDemoMode = () => localStorage.getItem(DEMO_KEY) === "1";
export const setDemoMode = () => localStorage.setItem(DEMO_KEY, "1");

export const isAuthenticated = () => !!getToken() || isDemoMode();

function required(name: string): string | null {
  const v = process.env[name];
  if (!v || !v.trim()) return null;
  return v.trim();
}

export function getDatabaseUrl(): string | null {
  return required("DATABASE_URL");
}

export function getDashboardPassword(): string | null {
  return required("INVESTOR_DASHBOARD_PASSWORD");
}

export function getSessionSecret(): string | null {
  return required("SESSION_SECRET");
}

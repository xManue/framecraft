export function licenseChoice(expression: unknown): string[] | undefined;
export function npmLicenseInventory(lock: unknown, scopeRoots: Record<string, Record<string, string>>): {
  packages: { path: string; name: string; version: string; license: string; selectedLicenses: string[]; decision: string; scopes: string[] }[];
  missing: { name: string; from: string; scope: string }[];
};

export const BARCODE_REGEX = /^GK-(B|V)-[A-F0-9]{8}-[0-9A-Z]+-[A-F0-9]{6}$/;

export function isValidGatekeeperBarcode(value: string, expectedPrefix?: 'B' | 'V'): boolean {
  if (!BARCODE_REGEX.test(value)) {
    return false;
  }
  if (!expectedPrefix) {
    return true;
  }
  return value.startsWith(`GK-${expectedPrefix}-`);
}

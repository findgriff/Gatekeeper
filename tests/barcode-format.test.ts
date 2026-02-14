import { describe, expect, it } from 'vitest';
import { isValidGatekeeperBarcode } from '../src/main/barcode-format';

describe('gatekeeper barcode format', () => {
  it('accepts valid badge and vehicle barcode values', () => {
    expect(isValidGatekeeperBarcode('GK-B-1A2B3C4D-MRZ9P-ABC123', 'B')).toBe(true);
    expect(isValidGatekeeperBarcode('GK-V-FFEEDDCC-Z19-0011AA', 'V')).toBe(true);
  });

  it('rejects invalid format and wrong prefix', () => {
    expect(isValidGatekeeperBarcode('GK-X-1A2B3C4D-MRZ9P-ABC123')).toBe(false);
    expect(isValidGatekeeperBarcode('GK-B-1A2B3C4-MRZ9P-ABC123')).toBe(false);
    expect(isValidGatekeeperBarcode('GK-B-1A2B3C4D-MRZ9P-ABC12Z', 'V')).toBe(false);
    expect(isValidGatekeeperBarcode('NOT-A-BARCODE')).toBe(false);
  });
});

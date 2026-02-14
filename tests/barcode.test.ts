import { describe, expect, it } from 'vitest';
import { generateBarcodeDataUrl } from '../src/main/barcode';

describe('barcode generation', () => {
  it('generates code128 data url', async () => {
    const dataUrl = await generateBarcodeDataUrl('GK-TEST-123', 'CODE128');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(100);
  });

  it('generates qr data url', async () => {
    const dataUrl = await generateBarcodeDataUrl('GK-QR-123', 'QR');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});

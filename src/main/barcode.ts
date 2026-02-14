import bwipjs from 'bwip-js';

export async function generateBarcodeDataUrl(value: string, type: 'CODE128' | 'QR' = 'CODE128'): Promise<string> {
  const bcid = type === 'QR' ? 'qrcode' : 'code128';
  const png = await bwipjs.toBuffer({
    bcid,
    text: value,
    scale: 3,
    height: type === 'QR' ? 40 : 12,
    includetext: type !== 'QR',
    textxalign: 'center'
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}

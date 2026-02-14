import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { BrowserWindow, shell } from 'electron';
import type { PassPrintPayload } from '../shared/types';

function badgeHtml(payload: PassPrintPayload, photoDataUrl: string | null): string {
  const bg = payload.visit.escort_status === 'ESCORTED' ? '#8b0000' : '#0f6c2f';
  return `<!doctype html><html><body style="margin:0;font-family:Arial,sans-serif;">
  <section style="width:3.375in;height:2.125in;background:${bg};color:#fff;padding:12px;display:flex;gap:10px;box-sizing:border-box;">
    <img src="${photoDataUrl ?? ''}" style="width:70px;height:90px;object-fit:cover;border:2px solid #fff;background:#ccc" />
    <div style="display:flex;flex-direction:column;justify-content:space-between;flex:1;min-width:0;">
      <div>
        <div style="font-size:10px;letter-spacing:1px;">${payload.site.siteName}</div>
        <div style="font-weight:700;font-size:16px;line-height:1.1;">${payload.person.full_name}</div>
        <div style="font-size:12px;opacity:.95;">${payload.person.company}</div>
        <div style="font-size:11px;margin-top:3px;font-weight:700;">
          ${payload.visit.escort_status === 'ESCORTED' ? 'ESCORT STATUS: ESCORTED' : 'ESCORT STATUS: UNESCORTED'}
        </div>
      </div>
      <img src="${payload.badgeBarcodeDataUrl}" style="width:100%;height:44px;object-fit:contain;background:#fff;padding:2px;"/>
    </div>
  </section>
  </body></html>`;
}

function vehicleHtml(payload: PassPrintPayload): string {
  return `<!doctype html><html><body style="margin:0;font-family:Arial,sans-serif;">
  <section style="width:6in;height:3in;background:#fff;color:#111;border:2px solid #111;padding:14px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:12px;letter-spacing:1px;">${payload.site.siteName}</div>
        <div style="font-size:20px;font-weight:700;">VEHICLE PASS</div>
      </div>
      <div style="font-size:12px;text-align:right;">Issued: ${new Date(payload.visit.issued_at).toLocaleString()}</div>
    </div>
    <div style="font-size:15px;line-height:1.6;">
      <div><b>Name:</b> ${payload.person.full_name}</div>
      <div><b>Phone:</b> ${payload.person.phone}</div>
      <div><b>Company:</b> ${payload.person.company}</div>
    </div>
    <img src="${payload.vehicleBarcodeDataUrl}" style="width:100%;height:72px;object-fit:contain;"/>
  </section>
  </body></html>`;
}

async function htmlToPdf(html: string, outputPath: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false
    }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(outputPath, pdf);
  } finally {
    win.close();
  }
}

export async function generatePassPdfs(payload: PassPrintPayload, photoDataUrl: string | null): Promise<string[]> {
  const dir = path.join(os.tmpdir(), 'gatekeeper-passes');
  fs.mkdirSync(dir, { recursive: true });
  const base = `${payload.person.full_name.replace(/\s+/g, '_')}_${Date.now()}`;
  const badgePath = path.join(dir, `${base}_badge.pdf`);
  const vehiclePath = path.join(dir, `${base}_vehicle.pdf`);
  await htmlToPdf(badgeHtml(payload, photoDataUrl), badgePath);
  await htmlToPdf(vehicleHtml(payload), vehiclePath);
  scheduleTempCleanup([badgePath, vehiclePath]);
  return [badgePath, vehiclePath];
}

export async function openPdfPreview(pathname: string): Promise<void> {
  await shell.openPath(pathname);
}

export async function printPdfWithDialog(pathname: string): Promise<void> {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: {
      sandbox: false
    }
  });

  await win.loadURL(pathToFileURL(pathname).toString());
  await new Promise<void>((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, () => {
      resolve();
      win.close();
    });
  });
}

function scheduleTempCleanup(paths: string[]): void {
  setTimeout(() => {
    paths.forEach((pathname) => {
      if (fs.existsSync(pathname)) {
        fs.unlinkSync(pathname);
      }
    });
  }, 15 * 60 * 1000);
}

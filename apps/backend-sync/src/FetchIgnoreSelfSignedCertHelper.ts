import * as https from 'https';
import fetch from 'node-fetch';

export class FetchIgnoreSelfSignedCertHelper {
  public static async fetch(url: string, options: any = {}): Promise<any> {
    // Prüfe das Protokoll der URL
    const isHttps = url.startsWith('https:');

    if (isHttps) {
      // Agent für SSL-Zertifikatsprüfung deaktivieren (nur für HTTPS)
      options.agent = new https.Agent({
        rejectUnauthorized: false, // Ignoriert selbst-signierte Zertifikate
      });
    }
    // Für HTTP-URLs keinen Agent setzen - node-fetch handhabt dies automatisch

    // Führe den Fetch-Aufruf durch
    return fetch(url, options);
  }
}

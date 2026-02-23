import { exec } from 'child_process';
import { promisify } from 'util';
import { DockerDirectusPingHelper } from './DockerDirectusPingHelper';

const execAsync = promisify(exec);

export class DockerContainerManager {
  static DIRECTUS_SERVICE_NAME = 'my-dashboard-directus';

  /**
   * Startet den Directus-Container neu, wenn bsp die Datenbank schema geändert wurde.
   * Funktioniert mit Docker Compose Services (mit Replikas).
   */
  public static async restartDirectusContainers(directusInstanceUrl: string): Promise<boolean> {
    try {
      console.log(`🔄 Starte Neustart von ${this.DIRECTUS_SERVICE_NAME} Service (Docker Compose)...`);

      // 1. Zuerst prüfen ob Docker verfügbar ist
      try {
        await execAsync('docker --version');
        console.log(`✅ Docker CLI verfügbar`);
      } catch (error) {
        console.log(`❌ Docker CLI nicht verfügbar: ${error}`);
        return false;
      }

      // 2. Prüfen welche Container für den Service laufen (flexibel nach Service-Namen suchen)
      console.log(`🔍 Suche nach Containern mit Service-Namen ${this.DIRECTUS_SERVICE_NAME}...`);
      const listCommand = `docker ps --filter name=${this.DIRECTUS_SERVICE_NAME} --format "{{.Names}}"`;
      const { stdout: containerList } = await execAsync(listCommand);

      if (!containerList.trim()) {
        console.log(`❌ Keine laufenden Container für ${this.DIRECTUS_SERVICE_NAME} gefunden`);
        return false;
      }

      // Filter nur Container die tatsächlich mit unserem Service-Namen enden
      const allContainers = containerList
        .trim()
        .split('\n')
        .filter(name => name.trim());
      const containers = allContainers.filter(name => name.includes(this.DIRECTUS_SERVICE_NAME) && !name.includes('database-sync'));

      if (containers.length === 0) {
        console.log(`❌ Keine passenden Container für ${this.DIRECTUS_SERVICE_NAME} gefunden`);
        console.log(`📋 Verfügbare Container: ${allContainers.join(', ')}`);
        return false;
      }

      console.log(`📦 Gefundene Container: ${containers.join(', ')}`);

      // 3. Container einzeln neu starten (um Replikas zu berücksichtigen)
      for (const containerName of containers) {
        console.log(`🔄 Starte Container ${containerName} neu...`);
        try {
          await execAsync(`docker restart ${containerName}`);
          console.log(`✅ Container ${containerName} neu gestartet`);

          // Kurz warten zwischen Container-Neustarts für sanftes Rolling Update
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          console.log(`❌ Fehler beim Neustart von ${containerName}: ${error.message}`);
          return false;
        }
      }

      // 4. Warten bis alle Container wieder healthy sind
      console.log(`⏳ Warte bis alle Container wieder verfügbar sind...`);
      let attempts = 0;
      const maxAttempts = 30; // 2.5 Minuten bei 5-Sekunden-Intervallen

      while (attempts < maxAttempts) {
        attempts++;

        try {
          // Flexibel nach den gefundenen Container-Namen suchen
          const healthCommand = `docker ps --filter name=${this.DIRECTUS_SERVICE_NAME} --filter status=running --format "{{.Names}}"`;
          const { stdout: runningContainers } = await execAsync(healthCommand);
          const runningContainerNames = runningContainers
            .trim()
            .split('\n')
            .filter(name => name.trim() && name.includes(this.DIRECTUS_SERVICE_NAME) && !name.includes('database-sync'));

          console.log(`📊 Status: ${runningContainerNames.length}/${containers.length} Container laufen`);

          if (runningContainerNames.length >= containers.length) {
            console.log(`✅ Alle Container sind wieder verfügbar!`);
            break;
          }
        } catch (error) {
          console.log(`⚠️ Fehler beim Status-Check: ${error}`);
        }

        if (attempts >= maxAttempts) {
          console.log(`❌ Timeout: Nicht alle Container wurden rechtzeitig verfügbar`);
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 Sekunden warten
      }

      // 5. Health-Check durchführen
      console.log(`🏥 Führe Health-Check für Directus durch...`);
      const healthCheckSuccess = await DockerDirectusPingHelper.waitForDirectusHealthy(directusInstanceUrl); // 1 Minute Timeout

      if (healthCheckSuccess) {
        console.log(`✅ Directus Service erfolgreich neu gestartet und ist verfügbar!`);
        return true;
      } else {
        console.log(`❌ Health-Check fehlgeschlagen - Service möglicherweise nicht vollständig verfügbar`);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ Fehler beim Neustart der Directus Container: ${error.message}`);
      return false;
    }
  }

  /**
   * Alternative Methode mit docker-compose restart (falls verfügbar)
   */
  public static async restartDirectusContainersCompose(directusInstanceUrl: string): Promise<boolean> {
    try {
      console.log(`🔄 Versuche docker-compose restart für ${this.DIRECTUS_SERVICE_NAME}...`);

      // Zuerst prüfen ob docker-compose verfügbar ist
      try {
        await execAsync('docker-compose --version');
      } catch (error) {
        console.log(`❌ docker-compose nicht verfügbar, verwende Container-basierte Lösung`);
        return await this.restartDirectusContainers(directusInstanceUrl);
      }

      // Suche nach docker-compose.yaml Datei im Root oder backend Verzeichnis
      const composeCommand = `docker-compose -f /app/../../docker-compose.yaml restart ${this.DIRECTUS_SERVICE_NAME}`;

      console.log(`🔄 Führe docker-compose restart durch...`);
      const { stdout: composeOutput, stderr: composeError } = await execAsync(composeCommand);

      if (composeError && !composeError.includes('Warning')) {
        console.log(`❌ Fehler beim docker-compose restart: ${composeError}`);
        return false;
      }

      console.log(`✅ docker-compose restart ausgeführt: ${composeOutput.trim()}`);

      // Health-Check durchführen
      const healthCheckSuccess = await DockerDirectusPingHelper.waitForDirectusHealthy(directusInstanceUrl);

      if (healthCheckSuccess) {
        console.log(`✅ Directus Service mit docker-compose erfolgreich neu gestartet!`);
        return true;
      } else {
        console.log(`❌ Health-Check nach docker-compose restart fehlgeschlagen`);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ Fehler beim docker-compose restart: ${error.message}`);
      return false;
    }
  }
}

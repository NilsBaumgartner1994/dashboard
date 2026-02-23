import * as cron from 'node-cron';
import {CronHelper, CronObject} from "repo-depkit-common";

// Kurze Contract-Beschreibung:
// - Inputs: keine (Jobs werden intern oder über registerCronJob() registriert)
// - Outputs: lang laufender Prozess, Cron-Jobs werden zu festen Zeiten ausgeführt
// - Fehler: Sync-Aufruf führt bei Fehlern zu exit(1)

// Kleines API zum Registrieren von Cron-Jobs
export type CronTask = {
  id: string;
  schedule: CronObject; // cron expression
  task: () => Promise<void> | void;
};

const registeredTasks: Map<string, cron.ScheduledTask> = new Map();

// Set mit aktuell laufenden Job-Namen, um gleichzeitige Ausführungen zu verhindern
const runningTasks: Set<string> = new Set();

export function registerShutdownJobs(){
  // Halteprozess offen, sichere Beendigung bei SIGINT / SIGTERM
  const shutdown = async () => {
    console.log('Beende Backend-Sync Service...');
    stopAllCronJobs();
    // Warte kurz, damit laufende Tasks sauber enden können
    setTimeout(() => process.exit(0), 500);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export function registerCronJob(task: CronTask) {
  if (registeredTasks.has(task.id)) {
    console.warn(`Cron-Job mit Namen ${task.id} existiert bereits. Überspringe Registrierung.`);
    return;
  }

  const cronString = CronHelper.getCronString(task.schedule);
  // Validierung der Cron-Expression
  if (!cron.validate(cronString)) {
    console.error(`Ungültige Cron-Expression für Job ${task.id}: ${cronString}`);
    return;
  }

  const scheduled = cron.schedule(cronString, async () => {
    // Verhindere gleichzeitige Ausführungen desselben Jobs
    if (runningTasks.has(task.id)) {
      console.log(`Überspringe Start von Cron-Job ${task.id}, da bereits eine Ausführung läuft.`);
      return;
    }

    runningTasks.add(task.id);
    console.log(`Starte Cron-Job: ${task.id} (${new Date().toISOString()})`);
    try {
      await task.task();
      console.log(`Fertig Cron-Job: ${task.id} (${new Date().toISOString()})`);
    } catch (err) {
      console.error(`Fehler im Cron-Job ${task.id}:`, err);
    } finally {
      // Lock freigeben, damit zukünftige Ausführungen wieder laufen können
      runningTasks.delete(task.id);
    }
  }, {
    scheduled: true,
  });

  registeredTasks.set(task.id, scheduled);
  console.log(`Cron-Job registriert: ${task.id} -> ${cronString}`);
}

export function stopAllCronJobs() {
  for (const [name, scheduled] of registeredTasks.entries()) {
    try {
      scheduled.stop();
      console.log(`Cron-Job gestoppt: ${name}`);
    } catch (err) {
      console.warn(`Fehler beim Stoppen von Cron-Job ${name}:`, err);
    }
  }
}
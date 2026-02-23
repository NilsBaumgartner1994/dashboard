import {syncDatabase, SyncDataBaseOptionDockerPush} from "./SyncDatabaseSchema";
import {registerCronJob, registerShutdownJobs} from "./CronHelperManager";
import {buildConfigFromEnv, ensureAppleClientSecret} from "./apple-secret-rotator";
import {HOST_ENV_FILE_PATH} from "./apple-secret-rotator/DirectusEnvFileHelper";
import {CronHelper} from "repo-depkit-common";

async function main() {
  // start sync-database schema service
  console.log("Starting Backend-Sync Service...");

  registerShutdownJobs(); // Registriere sauberes Shutdown-Verhalten

  console.log("Continuing with database schema sync...");

  let runSyncDatabase = true
  if (runSyncDatabase){
    console.log("Syncing database schema with Docker Push option...");
    let errors = await syncDatabase(SyncDataBaseOptionDockerPush);
    if (errors) {
      console.error('❌ Fehler beim Synchronisieren des Datenbankschemas mit Docker Push Option.');
      process.exit(1);
    }
  }

  console.log('Backend-Sync Service läuft. Cron-Jobs sind aktiv.');
  // keep process alive: never-resolving promise ist besser als while(true) für TS
  await new Promise<never>(() => {});
}

// Starte den Service
main();

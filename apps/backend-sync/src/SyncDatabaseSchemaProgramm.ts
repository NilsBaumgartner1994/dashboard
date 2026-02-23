import {Command} from 'commander';
import {syncDatabase} from "./SyncDatabaseSchema";

const program = new Command();

// Programm-Konfiguration
program.name('backend-sync').description('Directus Backend Synchronization Tool').version('1.0.0');

// Push Command
program.option('--push', 'Push local schema to Directus').option('--pull', 'Pull schema from Directus to local').option('--pull-from-test-system', 'Pull schema from remote test system').option('--push-to-test-system', 'Push to remote test system').option('--docker-push', 'Push inside Docker container').option('--docker-directus-restart', 'Restart Directus Docker containers after push').option('--directus-url <url>', 'Directus instance URL').option('--admin-email <email>', 'Admin email').option('--admin-password <password>', 'Admin password').option('--path-to-data-directus-sync <path>', 'Path to sync data');

// Main function
async function main() {
  program.parse();
  const options = program.opts();
  await syncDatabase(options);
}

// Starte den Service
main();

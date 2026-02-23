import {CollectibleEventParticipants} from "./types";

/**
 * Helper for Account things
 */
export function getAllCollectionNames() {
  return Object.values(CollectionNames);
}

export enum CollectionNames {
  LANGUAGES = 'languages',
  DIRECTUS_FILES = 'directus_files',
  TELEGRAM_NOTIFICATIONS = 'telegram_notifications',
  APP_SETTINGS = 'app_settings',
  USERS = 'directus_users',
  ROLES = 'directus_roles',
  PERMISSIONS = 'directus_permissions',
  POLICIES = 'directus_policies',
  WORKFLOWS = 'workflows',
  WORKFLOWS_RUNS = 'workflows_runs'
}

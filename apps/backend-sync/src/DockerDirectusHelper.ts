export class DockerDirectusHelper {
  static DIRECTUS_CONTAINER_NAME = 'my-dashboard-directus';

  // Health-Check-Funktion für Directus
  public static getDirectusServerUrl(): string {
    const directusUrl = `http://${DockerDirectusHelper.DIRECTUS_CONTAINER_NAME}:${process.env.DIRECTUS_PORT || '8055'}`;
    //const healthCheckUrl = `${directusUrl}/server/health`; // Health prüft auch email connection, welche wenn nicht konfiguriert fehlschlägt
    return `${directusUrl}`; // daher als fallback
  }

  public static getDataPathToDirectusSyncData(): string {
    return '/my-dashboard/' + DockerDirectusHelper.getRelativePathToDirectusSyncFromProjectRoot();
  }

  public static getRelativePathToDirectusSyncFromProjectRoot(): string {
    return 'data/directus-sync-data';
  }
}

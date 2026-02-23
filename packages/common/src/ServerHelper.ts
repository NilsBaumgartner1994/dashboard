export type ServerConfig = {
  server_url: string;
};

export class ServerHelper {

  public static LOCAL_SERVER_CONFIG: ServerConfig = {
    server_url: 'https://127.0.0.1/my-dashboard/api',
  };

  public static TEST_SERVER_CONFIG: ServerConfig = {
    server_url: 'https://127.0.0.1/my-dashboard/api',
  };
}

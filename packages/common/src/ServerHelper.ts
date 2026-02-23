export type ServerConfig = {
  server_url: string;
};

export class ServerHelper {
  public static TEST_SERVER_CONFIG: ServerConfig = {
    server_url: 'https://127.0.0.1/flower-pi/api',
  };
}

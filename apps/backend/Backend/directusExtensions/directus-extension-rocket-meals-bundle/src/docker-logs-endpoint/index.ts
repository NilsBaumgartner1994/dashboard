import { defineEndpoint } from '@directus/extensions-sdk';
import { Client } from 'undici';

const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock';
const DEFAULT_TAIL = 300;
const MAX_TAIL = 2000;

interface DockerContainer {
  Id: string;
  Names?: string[];
  State?: string;
  Status?: string;
  Image?: string;
}

interface DockerLogChunk {
  streamType: number;
  payload: string;
}

function clampTail(input: unknown): number {
  const parsed = Number.parseInt(String(input ?? DEFAULT_TAIL), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TAIL;
  return Math.min(parsed, MAX_TAIL);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  return ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;
}

function decodeDockerMultiplexedLogs(buffer: Uint8Array): DockerLogChunk[] {
  const chunks: DockerLogChunk[] = [];
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    const streamType = buffer[offset] ?? 1;
    const length = readUInt32BE(buffer, offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > buffer.length) break;

    const payload = Buffer.from(buffer.slice(payloadStart, payloadEnd)).toString('utf-8');
    chunks.push({ streamType, payload });
    offset = payloadEnd;
  }

  if (chunks.length === 0 && buffer.length > 0) {
    chunks.push({ streamType: 1, payload: Buffer.from(buffer).toString('utf-8') });
  }

  return chunks;
}

async function withDockerClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client('http://localhost', {
    connect: { socketPath: DOCKER_SOCKET_PATH },
    headersTimeout: 10_000,
    bodyTimeout: 60_000,
  });
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function dockerGetJson<T>(path: string): Promise<T> {
  return withDockerClient(async (client) => {
    const response = await client.request({ method: 'GET', path });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const body = await response.body.text().catch(() => '');
      throw new Error(`Docker API ${response.statusCode}: ${body || 'unknown error'}`);
    }

    return (await response.body.json()) as T;
  });
}

async function dockerGetRaw(path: string): Promise<Uint8Array> {
  return withDockerClient(async (client) => {
    const response = await client.request({ method: 'GET', path });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const body = await response.body.text().catch(() => '');
      throw new Error(`Docker API ${response.statusCode}: ${body || 'unknown error'}`);
    }

    const arr = await response.body.arrayBuffer();
    return new Uint8Array(arr);
  });
}

export default defineEndpoint({
  id: 'docker-logs',
  handler: (router) => {
    router.get('/containers', async (req, res) => {
      try {
        const all = req.query.all === '1' || req.query.all === 'true';
        const filter = String(req.query.filter ?? '').trim().toLowerCase();
        const containers = await dockerGetJson<DockerContainer[]>(`/containers/json?all=${all ? 1 : 0}`);

        const mapped = containers
          .map((container) => {
            const names = (container.Names ?? []).map((n) => n.replace(/^\//, ''));
            const primaryName = names[0] ?? container.Id.slice(0, 12);
            return {
              id: container.Id,
              name: primaryName,
              names,
              state: container.State ?? 'unknown',
              status: container.Status ?? 'unknown',
              image: container.Image ?? 'unknown',
            };
          })
          .filter((container) => {
            if (!filter) return true;
            return container.name.toLowerCase().includes(filter)
              || container.names.some((name) => name.toLowerCase().includes(filter))
              || container.image.toLowerCase().includes(filter);
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        return res.json({ ok: true, containers: mapped });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(503).json({
          ok: false,
          error: message,
          hint: `Ensure ${DOCKER_SOCKET_PATH} is mounted into the Directus container and Docker daemon is reachable.`,
        });
      }
    });

    router.get('/logs', async (req, res) => {
      try {
        const container = String(req.query.container ?? '').trim();
        if (!container) {
          return res.status(400).json({ ok: false, error: 'query parameter "container" is required' });
        }

        const tail = clampTail(req.query.tail);
        const sinceSeconds = Number.parseInt(String(req.query.sinceSeconds ?? '0'), 10);
        const since = Number.isFinite(sinceSeconds) && sinceSeconds > 0
          ? Math.floor(Date.now() / 1000) - sinceSeconds
          : 0;

        const logsPath = `/containers/${encodeURIComponent(container)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}${since > 0 ? `&since=${since}` : ''}`;
        const raw = await dockerGetRaw(logsPath);
        const chunks = decodeDockerMultiplexedLogs(raw);

        const stdout = chunks.filter((c) => c.streamType === 1).map((c) => c.payload).join('');
        const stderr = chunks.filter((c) => c.streamType === 2).map((c) => c.payload).join('');
        const combined = chunks.map((c) => c.payload).join('');

        return res.json({
          ok: true,
          container,
          tail,
          sinceSeconds: sinceSeconds > 0 ? sinceSeconds : null,
          combined,
          stdout,
          stderr,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(503).json({ ok: false, error: message });
      }
    });
  },
});

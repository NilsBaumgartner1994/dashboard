import * as path from 'path';
import * as fs from 'fs';

async function findFileUpwards(startDir: string, filename: string): Promise<string | null> {
  let currentDir = startDir;

  while (true) {
    const potentialPath = path.join(currentDir, filename);
    if (fs.existsSync(potentialPath)) {
      return potentialPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached the root directory
    }
    currentDir = parentDir;
  }

  return null;
}

export async function findEnvFile(): Promise<string | null> {
  const startDir = process.cwd();
  return findFileUpwards(startDir, '.env');
}
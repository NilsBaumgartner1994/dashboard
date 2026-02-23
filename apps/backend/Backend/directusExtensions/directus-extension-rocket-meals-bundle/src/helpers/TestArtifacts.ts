// https://docs.directus.io/extensions/hooks.html#available-events
import path from 'path';
import fse from 'fs-extra';

export class TestArtifacts {
  static getPathToTestArtifacts(): string {
    const rootPath = path.resolve(process.cwd(), 'test-artifacts');
    return rootPath;
  }

  static getPathToTestArtifact(filePath: string): string {
    return path.join(this.getPathToTestArtifacts(), filePath);
  }

  static saveTestArtifact(content: string | NodeJS.ArrayBufferView, relativePath: string): string {
    // iterate over folderAndFileNames and replace "/" into separator

    const filePath = this.getPathToTestArtifact(relativePath);
    // create folder if not exists
    const folderPath = path.dirname(filePath);

    fse.ensureDirSync(folderPath);

    fse.writeFileSync(filePath, content);
    return filePath;
  }
}

import path from 'path';

export class PathHelper {
  public static getPathToDirectusExtension(): string {
    let cwd = path.resolve(process.cwd());
    // JEST: process.cwd():  /Users/nilsbaumgartner/Documents/GitHub/rocket-meals/backend/Backend/directusExtensions/directus-extension-rocket-meals-bundle
    // DIRECTUS: process.cwd():  /directus
    // -- extensions
    // ---- directus-extension-rocket-meals-bundle

    if (cwd.includes('directusExtensions')) {
      // we are in the directus extension and need to go one level up
      return path.join(cwd, '..');
    } else {
      // we are in the directus root and need to go to the extensions folder
      return path.join(cwd, 'extensions');
    }
  }

  public static getPathToLiquidTemplates(): string {
    return path.join(this.getPathToDirectusExtension(), 'templates');
  }
}

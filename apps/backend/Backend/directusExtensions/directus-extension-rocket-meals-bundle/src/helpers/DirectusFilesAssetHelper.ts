import { DatabaseTypes } from 'repo-depkit-common';
import { MyDatabaseTestableHelperInterface } from './MyDatabaseHelperInterface';

export type DirectusFilesAssetHelperOptions = {
  bearerToken?: string | null | undefined;
};

export type DirectusFileTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
};

export class DirectusFilesAssetHelper {
  public static PRESET_FILE_TRANSFORMATION_IMAGE_HD: DirectusFileTransformOptions = {
    width: 1024,
    height: 1024,
  };

  private static getAssetUrl(serverUrl: string, directusFileId: string, options?: DirectusFileTransformOptions): string {
    let url = `${serverUrl}/assets/${directusFileId}`;

    const params = new URLSearchParams();
    if (options?.width) params.append('width', options.width.toString());
    if (options?.height) params.append('height', options.height.toString());
    if (options?.quality) params.append('quality', options.quality.toString());
    if (options?.fit) params.append('fit', options.fit);

    return params.toString() ? `${url}?${params.toString()}` : url;
  }

  public static getDirectAssetUrlByObjectOrId(directusFile: DatabaseTypes.DirectusFiles | string, myDatabaseTestableHelperInterface: MyDatabaseTestableHelperInterface, options?: DirectusFileTransformOptions): string {
    if (typeof directusFile === 'string') {
      return DirectusFilesAssetHelper.getDirectAssetUrlById(directusFile, myDatabaseTestableHelperInterface, options);
    } else {
      return DirectusFilesAssetHelper.getDirectAssetUrl(directusFile, myDatabaseTestableHelperInterface, options);
    }
  }

  /**
   * Access only if permission is granted for the file
   * @param directusFile
   * @param myDatabaseTestableHelperInterface
   * @param options
   */
  public static getDirectAssetUrl(directusFile: DatabaseTypes.DirectusFiles, myDatabaseTestableHelperInterface: MyDatabaseTestableHelperInterface, options?: DirectusFileTransformOptions): string {
    return DirectusFilesAssetHelper.getDirectAssetUrlById(directusFile.id, myDatabaseTestableHelperInterface, options);
  }

  public static getDirectAssetUrlById(directusFileId: string, myDatabaseTestableHelperInterface: MyDatabaseTestableHelperInterface, options?: DirectusFileTransformOptions): string {
    let publicServerUrl = myDatabaseTestableHelperInterface.getServerUrl();
    return DirectusFilesAssetHelper.getAssetUrl(publicServerUrl, directusFileId, options);
  }
}

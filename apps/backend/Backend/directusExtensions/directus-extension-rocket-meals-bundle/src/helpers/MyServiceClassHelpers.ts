import {
    AssetsService as DirectusAssetsService,
    SharesService as DirectusShareService,
    FieldsService as DirectusFieldsService
} from '@directus/api/dist/services'; // TODO: Check for future

export class AssetsService extends DirectusAssetsService {}
export class SharesService extends DirectusShareService {}
export class FieldsService extends DirectusFieldsService {}
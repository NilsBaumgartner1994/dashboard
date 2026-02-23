import { CollectionNames, DatabaseTypes } from 'repo-depkit-common';

import { ApiContext } from '../ApiContext';
import { ItemsServiceCreator } from '../ItemsServiceCreator';
import { EventContext } from '@directus/types';

export class AppSettingsHelper {
  private readonly apiExtensionContext: ApiContext;
  private readonly eventContext?: EventContext;

  constructor(apiExtensionContext: ApiContext, eventContext?: EventContext) {
    this.apiExtensionContext = apiExtensionContext;
    this.eventContext = eventContext;
  }

  async getAppSettings(): Promise<Partial<DatabaseTypes.AppSettings> | undefined | null> {
    const itemsServiceCreator = new ItemsServiceCreator(this.apiExtensionContext);
    const itemsService = await itemsServiceCreator.getItemsService<DatabaseTypes.AppSettings>(CollectionNames.APP_SETTINGS);
    return await itemsService.readSingleton({});
  }

  async getRedirectWhitelist(): Promise<string[] | undefined> {
    let settings = await this.getAppSettings();
    let redirect_whitelist = settings?.redirect_whitelist as string[] | undefined | null;
    if (!redirect_whitelist) {
      return undefined;
    }
    return redirect_whitelist;
  }
}

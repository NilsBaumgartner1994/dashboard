import { defineHook } from '@directus/extensions-sdk';
import {DatabaseInitializedCheck} from "./DatabaseInitializedCheck";

/**
 * Helper for Account things
 */
export class MyDefineHook {
  public static defineHookWithAllTablesExisting(
      hookName: string,
      handler: Parameters<typeof defineHook>[0]
  ) {
    // Wir geben eine Hook-Definition zurück wie defineHook
    return defineHook(async (context, apiContext) => {
      const allTablesExist =
          await DatabaseInitializedCheck.checkAllTablesExistWithApiContext(
              hookName ?? 'UnnamedHook',
              apiContext
          );

      if (!allTablesExist) {
        return;
      }

      // Wenn alles ok, dann den eigentlichen Handler ausführen
      return handler(context, apiContext);
    });
  }
}
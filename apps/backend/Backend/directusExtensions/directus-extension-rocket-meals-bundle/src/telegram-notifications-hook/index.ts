import { CollectionNames, DatabaseTypes } from 'repo-depkit-common';
import { MyDatabaseHelper } from '../helpers/MyDatabaseHelper';
import { MyDefineHook } from '../helpers/MyDefineHook';
import { TelegramHelper, TelegramSendMessagePayload } from '../helpers/telegram/TelegramHelper';

const HOOK_NAME = 'telegram-notifications-hook';

export default MyDefineHook.defineHookWithAllTablesExisting(HOOK_NAME, async ({ action }, apiContext) => {
  action(CollectionNames.TELEGRAM_NOTIFICATIONS + '.items.create', async ({ key, payload }, eventContext) => {
    if (!key && !payload) {
      return;
    }

    const myDatabaseHelper = new MyDatabaseHelper(apiContext, eventContext);
    const appSettings = await myDatabaseHelper.getAppSettingsHelper().getAppSettings();
    const botToken = appSettings?.telegram_bot_token;

    if (!botToken) {
      console.warn('Telegram notification skipped: missing telegram_bot_token in app settings.');
      return;
    }

    let notification: Partial<DatabaseTypes.TelegramNotifications> | undefined;
    const payloadNotification = payload as Partial<DatabaseTypes.TelegramNotifications> | undefined;

    if (key) {
      try {
        notification = await myDatabaseHelper
          .getItemsServiceHelper<DatabaseTypes.TelegramNotifications>(CollectionNames.TELEGRAM_NOTIFICATIONS)
          .readOne(key);
      } catch (error) {
        console.warn('Telegram notification: failed to load created item, falling back to payload.', error);
      }
    }

    const chatId = notification?.chat_id ?? payloadNotification?.chat_id;
    const message = notification?.message ?? payloadNotification?.message;

    if (!chatId || !message) {
      console.warn('Telegram notification skipped: missing chat_id or message.');
      return;
    }

    const telegramPayload: TelegramSendMessagePayload = {
      chat_ids: [chatId],
      text: message,
      parse_mode: notification?.parse_mode ?? payloadNotification?.parse_mode ?? undefined,
      disable_notification:
        notification?.disable_notification ?? payloadNotification?.disable_notification ?? undefined,
      message_thread_id: notification?.message_thread_id ?? payloadNotification?.message_thread_id ?? undefined,
    };

    try {
      await TelegramHelper.sendMessage(botToken, telegramPayload);
    } catch (error) {
      console.error('Telegram notification failed to send.', error);
    }
  });
});

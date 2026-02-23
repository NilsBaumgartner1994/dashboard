import { defineHook } from '@directus/extensions-sdk';
import { DatabaseInitializedCheck } from '../helpers/DatabaseInitializedCheck';
import { ActivityServiceCreator } from '../helpers/ItemsServiceCreator';
import {MyDefineHook} from "../helpers/MyDefineHook";

const SCHEDULE_NAME = 'activity_auto_cleanup';

export default MyDefineHook.defineHookWithAllTablesExisting(SCHEDULE_NAME, async ({ schedule }, apiContext) => {
  const isProduction = true;

  const cronFrequencyEveryDayAt4AM = '0 4 * * *';
  const cronFrequencyEveryMinute = '0 * * * * *';
  const cronFrequency = isProduction ? cronFrequencyEveryDayAt4AM : cronFrequencyEveryMinute;

  /**
   * Automated Log Rotation
   * Set up automated log rotation to ensure that your log files remain manageable in size and are archived periodically.
   */

  const MODE_DELETE_OLD_LOGS: string = 'delete_old_logs';
  //const MODE_DELETE_PERSONAL_DATA: string = "delete_personal_data";
  const MODE_SELECTED: string = MODE_DELETE_OLD_LOGS;

  // https://www.datenschutz-notizen.de/ip-adressen-und-datenschutz-teil-iii-speicherfristen-0634313/
  // https://www.datenschutz-notizen.de/speicherdauer-von-logfiles-innerhalb-des-unternehmensnetzwerks-1344161/

  const MAX_MINUTES_TO_KEEP_PRODUCTION: number = 60 * 24 * 30; // 30 days
  const MAX_MINUTES_TO_KEEP_DEVELOPMENT: number = 5;
  const MAX_MINUTES_TO_KEEP: number = isProduction ? MAX_MINUTES_TO_KEEP_PRODUCTION : MAX_MINUTES_TO_KEEP_DEVELOPMENT;

  schedule(cronFrequency, async () => {
    apiContext.logger.info(SCHEDULE_NAME + ': start schedule run: ' + new Date().toISOString());
    const activityServiceCreator = new ActivityServiceCreator(apiContext);
    const activityService = await activityServiceCreator.getActivityService();

    if (MODE_SELECTED === MODE_DELETE_OLD_LOGS) {
      const FIELD_TIMESTAMP = 'timestamp';

      apiContext.logger.info(SCHEDULE_NAME + ': Deleting old logs');
      let now = new Date();
      let nowMinusMaxDays = new Date();
      nowMinusMaxDays.setMinutes(now.getMinutes() - MAX_MINUTES_TO_KEEP);
      // timestamp required in timestamp	"2024-05-12T10:45:52.792Z"
      let nowMinusMaxDaysISO = nowMinusMaxDays.toISOString();
      apiContext.logger.info(SCHEDULE_NAME + ': nowMinusMaxDaysISO: ' + nowMinusMaxDaysISO);

      // https://github.com/directus/directus/blob/main/api/src/services/items.ts
      const query = {
        limit: -1,
        filter: {
          _and: [
            {
              [FIELD_TIMESTAMP]: {
                _lte: nowMinusMaxDaysISO,
              },
            },
          ],
        },
      };

      await activityService.deleteByQuery(query);
    }
    //else if (MODE_SELECTED===MODE_DELETE_PERSONAL_DATA){
    //    logger.info(SCHEDULE_NAME+ ": Deleting personal data");
    //    const FIELD_IP = "ip";
    //    const FIELD_USER_AGNET = "user_agent";
    //}
  });
});

import { Accountability } from '@directus/types';

/**
 * Helper for Account things
 */
export class AccountabilityHelper {
  public static getAccountabilityFromRequest(req: any): Accountability | undefined {
    const accountability = req?.accountability;
    if (accountability) {
      return accountability as Accountability;
    } else {
      return undefined;
    }
  }

  public static isAdminAccountability(accountability?: Accountability | null): boolean {
    if (!accountability) {
      return false;
    }

    if (accountability.admin === true) {
      return true;
    }

    return (accountability as { adminAccess?: boolean }).adminAccess === true;
  }
}

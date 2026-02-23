import { DatabaseTypes } from 'repo-depkit-common';

const HELPER_NAME = 'PushNotificationHelper';

type PushTokenObject = {
  pushtokenObj?: {
    data?: unknown;
  };
};

export class PushNotificationHelper {
  static getExpoPushTokenFromDevice(device: DatabaseTypes.Devices): string | undefined {
    const pushTokenObj = this.parsePushTokenObj(device.pushTokenObj);
    if (!pushTokenObj) {
      console.log(`${HELPER_NAME}: Device ${device.id} has no push token object`);
      return undefined;
    }

    const expoTokenCandidate = (pushTokenObj as PushTokenObject)?.pushtokenObj?.data;
    if (typeof expoTokenCandidate === 'string') {
      return expoTokenCandidate;
    }

    console.log(`${HELPER_NAME}: Device ${device.id} push token object does not contain a valid Expo token`);
    return undefined;
  }

  static getExpoPushTokensToDevicesDict(
    devices: DatabaseTypes.Devices[]
  ): Record<string, DatabaseTypes.Devices[]> {
    const expoPushTokensDict: Record<string, DatabaseTypes.Devices[]> = {};
    for (const device of devices) {
      const expoPushToken = this.getExpoPushTokenFromDevice(device);
      if (!expoPushToken) {
        continue;
      }

      if (!expoPushTokensDict[expoPushToken]) {
        expoPushTokensDict[expoPushToken] = [];
      }

      expoPushTokensDict[expoPushToken].push(device);
    }

    return expoPushTokensDict;
  }

  static getExpoPushTokensFromDevices(devices: DatabaseTypes.Devices[]): string[] {
    return Object.keys(this.getExpoPushTokensToDevicesDict(devices));
  }

  private static parsePushTokenObj(raw: unknown): Record<string, unknown> | undefined {
    if (!raw) {
      return undefined;
    }

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch (error) {
        console.warn(`${HELPER_NAME}: Failed to parse push token object`, error);
        return undefined;
      }
    }

    if (typeof raw === 'object') {
      return raw as Record<string, unknown>;
    }

    return undefined;
  }
}

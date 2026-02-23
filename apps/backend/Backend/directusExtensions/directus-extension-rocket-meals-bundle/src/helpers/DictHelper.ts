export class DictHelper {
  static getValueListFromDict<T>(dict: { [p: string]: T }): T[] {
    let keys = Object.keys(dict);
    let values: T[] = [];
    for (let key of keys) {
      let value = dict[key];
      if (!!value) {
        values.push(value);
      }
    }
    return values;
  }

  static transformListToDict<T>(list: T[], keySelector: ((item: T) => string) | string): Record<string, T> {
    let dict: { [p: string]: T } = {};
    for (let item of list) {
      let key: string | undefined = undefined;
      if (typeof keySelector === 'string') {
        let property: string = keySelector as string;
        // @ts-ignore
        key = item[property];
      } else {
        key = keySelector(item);
      }

      if (!!key) {
        dict[key] = item;
      }
    }
    return dict;
  }
}

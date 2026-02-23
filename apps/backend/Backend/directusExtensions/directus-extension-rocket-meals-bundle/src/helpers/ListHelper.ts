export class ListHelper {
  static removeDuplicatesFromJsonListWithSelector<T>(jsonList: T[], selector: (json: T) => any) {
    let valueList: any = [];
    let keyDict: any = {};

    for (let json of jsonList) {
      let keyValue = selector(json);
      const savedValue = keyDict[keyValue];
      if (!savedValue) {
        keyDict[keyValue] = json;
        valueList.push(json);
      } else {
        // Duplicate found - ignore it
      }
    }

    return valueList;
  }

  static removeDuplicatesFromJsonList<T>(jsonList: T[], key: keyof T) {
    return ListHelper.removeDuplicatesFromJsonListWithSelector(jsonList, json => json[key]);
  }
}

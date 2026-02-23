import {SchemaOverview} from "@directus/types";

export class SchemaHelper {
  /**
   * https://test.rocket-meals.de/rocket-meals/api/schema/snapshot
   * @param schema
   * @param collectionName
   */
  static getSchemaForCollection(schema: SchemaOverview, collectionName: string) {
    return schema?.collections?.[collectionName];
  }
}

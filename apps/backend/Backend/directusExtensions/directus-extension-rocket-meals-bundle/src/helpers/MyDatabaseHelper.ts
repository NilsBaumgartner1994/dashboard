import { ApiContext } from './ApiContext';

import { ItemsServiceHelper } from './ItemsServiceHelper';
import { CollectionNames, DatabaseTypes } from 'repo-depkit-common';

import { ServerServiceCreator } from './ItemsServiceCreator';
import { AppSettingsHelper } from './itemServiceHelpers/AppSettingsHelper';
import { WorkflowsRunHelper } from './itemServiceHelpers/WorkflowsRunHelper';
import { FilesServiceHelper } from './FilesServiceHelper';
import { EventContext, SchemaOverview } from '@directus/types';
import { MyDatabaseHelperInterface } from './MyDatabaseHelperInterface';
import { EnvVariableHelper } from './EnvVariableHelper';
import ms from 'ms';
import jwt from 'jsonwebtoken';
import { NanoidHelper } from './NanoidHelper';
import { UserHelper } from './UserHelper';

export type MyEventContext = EventContext;

export class MyDatabaseHelper implements MyDatabaseHelperInterface {
  public apiContext: ApiContext;
  public eventContext: MyEventContext | undefined;
  public useLocalServerMode: boolean = false;

  constructor(apiContext: ApiContext, eventContext?: MyEventContext) {
    this.apiContext = apiContext;
    // if available we should use eventContext - https://github.com/directus/directus/discussions/11051
    this.eventContext = eventContext; // stupid typescript error, because of the import
    // its better to use the eventContext, because of reusing the database connection instead of creating a new one
  }

  /**
   * Should be used for downloading files, as traefik does not support the public external url
   */
  public cloneWithInternalServerMode(): MyDatabaseHelper {
    let newInstance = new MyDatabaseHelper(this.apiContext, this.eventContext);
    newInstance.useLocalServerMode = true;
    return newInstance;
  }

  async getSchema(): Promise<SchemaOverview> {
    if (this?.eventContext?.schema) {
      return this.eventContext.schema;
    } else {
      return await this.apiContext.getSchema();
    }
  }

  async getAdminBearerToken(): Promise<string | undefined> {
    let usersHelper = await this.getUsersHelper();
    let adminEmail = EnvVariableHelper.getAdminEmail();
    let adminUser = await usersHelper.findFirstItem({
      email: adminEmail,
      provider: 'default',
    });
    const secret = EnvVariableHelper.getSecret();
    if (!adminUser) {
      console.error('Admin user not found');
      return undefined;
    }

    const refreshToken = await NanoidHelper.getNanoid(64);
    const msRefreshTokenTTL: number = ms(String(EnvVariableHelper.getRefreshTTL())) || 0;
    const refreshTokenExpiration = new Date(Date.now() + msRefreshTokenTTL);

    let knex = this.apiContext.database;

    // Insert session into Directus
    await knex('directus_sessions').insert({
      token: refreshToken,
      user: adminUser.id, // Required, cannot be NULL
      expires: refreshTokenExpiration,
      ip: null,
      user_agent: null,
      origin: null,
    });

    // JWT payload
    const tokenPayload = {
      id: adminUser.id,
      role: adminUser.role,
      app_access: true,
      admin_access: true,
      session: refreshToken, // Attach the session
    };

    // Sign JWT with Directus secret
    // @ts-ignore - this is a workaround for the typescript error
    const accessToken = jwt.sign(tokenPayload, secret, {
      expiresIn: EnvVariableHelper.getAccessTokenTTL(),
      issuer: 'directus',
    });

    return `${accessToken}`;
  }

  async getServerInfo() {
    const serverServiceCreator = new ServerServiceCreator(this.apiContext);
    return await serverServiceCreator.getServerInfo();
  }

  getServerUrl(): string {
    let defaultServerUrl = 'http://127.0.0.1'; // https://github.com/directus/directus/blob/9bd3b2615bb6bc5089ffcf14d141406e7776dd0e/docs/self-hosted/quickstart.md?plain=1#L97
    // could be also: http://rocket-meals-directus:8055/server/info but we stick to the default localhost
    // TODO: Fix traefik and use the public url support

    let defaultServerPort = this.getServerPort();
    if (defaultServerPort) {
      defaultServerUrl += `:${defaultServerPort}`;
    }

    if (this.useLocalServerMode) {
      return defaultServerUrl;
    }

    return EnvVariableHelper.getEnvVariable('PUBLIC_URL') || defaultServerUrl;
  }

  getServerPort(): string {
    let defaultServerPort = '8055';
    return EnvVariableHelper.getEnvVariable('PORT') || defaultServerPort;
  }

  getAppSettingsHelper() {
    return new AppSettingsHelper(this.apiContext);
  }

  getUsersHelper() {
    return new UserHelper(this, CollectionNames.USERS);
  }

  getWorkflowsHelper() {
    return new ItemsServiceHelper<DatabaseTypes.Workflows>(this, CollectionNames.WORKFLOWS);
  }

  getWorkflowsRunsHelper() {
    return new WorkflowsRunHelper(this, CollectionNames.WORKFLOWS_RUNS);
  }

  getItemsServiceHelper<T>(collectionName: CollectionNames) {
    return new ItemsServiceHelper<T>(this, collectionName);
  }

  getFilesHelper() {
    return new FilesServiceHelper(this);
  }
}

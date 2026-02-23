import {DatabaseTypes} from 'repo-depkit-common';
import {ItemsServiceHelper} from "./ItemsServiceHelper";
import {PrimaryKey} from "@directus/types";

export class DevicesServiceHelper extends ItemsServiceHelper<DatabaseTypes.Devices> {

  public async readManyByProfile(profile: DatabaseTypes.Profiles){
    return this.readManyByProfileId(profile.id);
  }

  public async readManyByProfileId(profileId: PrimaryKey){
    return this.readByQuery({
        filter: {
            profile: {
                _eq: profileId
            }
        }
    });
  }

}

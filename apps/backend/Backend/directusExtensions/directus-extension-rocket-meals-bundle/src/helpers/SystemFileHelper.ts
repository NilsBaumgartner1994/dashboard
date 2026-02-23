import path from 'path';
import fs from 'fs';

export class SystemFileHelper {
  static async readFileSync(path_to_file: string, encoding: BufferEncoding): Promise<string | undefined> {
    if (path_to_file) {
      try {
        //const absolutePath = path.resolve(path_to_file)
        //console.log("TL1Parser: absolutePath: "+absolutePath)
        const options = { encoding: encoding };
        const content = fs.readFileSync(path.resolve(path_to_file), options);
        //console.log("TL1 Report; length= "+content.length);
        return content.toString();
      } catch (err: any) {
        console.log('TL1 Report read error: ');
        console.log(err.toString());
      }
    }
    return undefined;
  }
}

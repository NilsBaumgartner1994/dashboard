# Schema Export / Deployment

- start up the directus server
- adapt the schema in the directus server page
- export the schema
  - `npm install`
  - `npm run schema-export`

# TODO: Future work:

TODO: Maybe we shall use this: https://github.com/bcc-code/directus-schema-sync/

## Installation

```bash
npm install
```

## Troubleshooting

If sharp fails to install, try to use their option to install optional dependencies:

```bash
npm install --include=optional sharp
```

If this still fails, try mock the sharp module. Since any sharp module (not working) is installed we
will fix this. Directus does not need sharp to export or import schemes.

Inset at line 33 in `./node_modules/@directus/api/node_modules/sharp/lib/sharp.js` right after
`let sharp = undefined`:

```bash
sharp = {
   _isUsingJemalloc: () => {return true},
   cache: () => {},
   libvipsVersion: () => {
        return {
                semver: "0.33.2"
        }
   },
   format: () => {
        return {
                heif: {output: {alias: undefined}},
                jpeg: {output: {alias: undefined}},
                tiff: {output: {alias: undefined}},
                jp2k: {output: {alias: undefined}},
        }
   }
}
```

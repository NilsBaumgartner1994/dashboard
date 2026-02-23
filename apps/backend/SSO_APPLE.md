### Apple Sign In

Since it is a bit ugly with apple, here is a small tutorial:

! You will need an Apple Developer Account ! Followed partially tutorial from: Found from:
https://sarunw.com/posts/sign-in-with-apple-4/

- 1. Find your Apple Team ID --> Variable TEAM_ID
  - https://developer.apple.com/account/resources/identifiers/list
  - Top right corner, after your name like: "... - 6U99XXXXXX"
- 2. Create an App ID (Primary App ID) --> See README.md for creating App ID
  - The App ID will be used as primary App ID in the next steps
- 3. Create a Service ID (Configuration of the Return URL)
  - Visit Identifiers (https://developer.apple.com/account/resources/identifiers/list)
  - Press top right on the search icon and search for "Service IDs"
  - Select one or create a new "Register a Service ID"
  - Select "Service IDs" and press the "Continue" Button
  - Fill in the following:
    - Description: "<PRODUCT> SSO Service"
    - Identifier: "de.baumgartner-software.<PRODUCT>.sso"
  - The identifier of the service will be our "AUTH_APPLE_CLIENT_ID"
    - Continue --> Register --> Done
  - Select the created Service ID
  - Scroll down to "Sign In with Apple"
  - Check "Sign in with Apple"
  - Click "Configure" (Sign in with Apple)
    - Select or create a primary App ID
    - Enter Domains:
      - test.rocket-meals.de
      - <project>.rocket-meals.de
    - Enter the return URLs:
      "https://test.rocket-meals.de/rocket-meals/api/auth/login/apple/callback"
    - Enter the return URLs:
      "https://<project>.rocket-meals.de/rocket-meals/api/auth/login/apple/callback"
      - Continue --> Save
- Keys (https://developer.apple.com/account/resources/authkeys/list)
  - Create a new key
  - Fill in a name: "SSO Key"
  - Check "Sign in with Apple"
  - Click Configure (Sign in with Apple)
    - Select same primary App ID as before
  - Click Continue
  - Click Register
  - Save "Key ID", we will need this in a moment
  - Save File as we cannot download it again
    - Save it in Google Drive
    - The content of the file will be our "KEY_FILE_CONTENT"
    - Otherwise you can use the file itself too
  - Click Download and save file as: "key.txt"
- Secret Generation
  - Have the following values ready: "TEAM_ID", "AUTH_APPLE_CLIENT_ID", "KEY_ID", "KEY_FILE_CONTENT"
  - run
    `./genSSO_Apple.sh --team_id <TEAM_ID> --client_id <AUTH_APPLE_CLIENT_ID> --key_id <KEY_ID> --key_file_content "<>"`
    - Alternatively you can use the file path instead of the content with
      `--key_file_path <PATH_TO_FILE>`
  - Copy the output --> This will be our AUTH_APPLE_CLIENT_SECRET
- Adapt docker-compose.yaml
  - Add `apple` to auth providers in the following `AUTH_PROVIDERS: "apple,google,facebook"` or only
    apple (line 89) ! Apple needs to be first due to terms & conditions

## Troubleshooting

- URL: XXX.rocket-meals.de
  - Message: "Invalid redirect URL"
  - Altough the message states that the redirect URL is invalid, the problem is the secret
  - Check the server log:
  - ```
    err: {
      "type": "",
      "message": "Service \"openid\" is unavailable. Service returned unexpected response: undefined.",
      "stack":
          DirectusError: Service "openid" is unavailable. Service returned unexpected response: undefined.
              at handleError (file:///directus/node_modules/.pnpm/@directus+api@file+api_@aws-sdk+client-sso-oidc@3.569.0_@aws-sdk+client-sts@3.569.0_@types+no_crtpmuhomzjtudzfxjp6matirq/node_modules/@directus/api/dist/auth/drivers/openid.js:225:16)
              at OpenIDAuthDriver.getUserID (file:///directus/node_modules/.pnpm/@directus+api@file+api_@aws-sdk+client-sso-oidc@3.569.0_@aws-sdk+client-sts@3.569.0_@types+no_crtpmuhomzjtudzfxjp6matirq/node_modules/@directus/api/dist/auth/drivers/openid.js:123:19)
              at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
              at async AuthenticationService.login (file:///directus/node_modules/.pnpm/@directus+api@file+api_@aws-sdk+client-sso-oidc@3.569.0_@aws-sdk+client-sts@3.569.0_@types+no_crtpmuhomzjtudzfxjp6matirq/node_modules/@directus/api/dist/services/authentication.js:44:22)
              at async file:///directus/node_modules/.pnpm/@directus+api@file+api_@aws-sdk+client-sso-oidc@3.569.0_@aws-sdk+client-sts@3.569.0_@types+no_crtpmuhomzjtudzfxjp6matirq/node_modules/@directus/api/dist/auth/drivers/openid.js:293:28
      "name": "DirectusError",
      "extensions": {
        "service": "openid",
        "reason": "Service returned unexpected response: undefined"
      },
      "code": "SERVICE_UNAVAILABLE",
      "status": 503
    }
    ```
  - This means apple allows the redirect to rocket-meals but rocket-meals may have a problem with
    the secret.
  - Check if the secret is correct
  - The server log throws an error about "Open ID", which means the secret provided is not correct
- URL: apple.com
  - Message "redirect_uri_mismatch"
  - Apple does not allow the redirect to the URL
    - Check if the redirect URL is correct. Check if it contains "/rocket-meals/api" and not only
      "/api"

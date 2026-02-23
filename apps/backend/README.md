# RocketMealsBackend

Production: The backend is available at: `https://<MYHOST>/rocket-meals/api/` (replace MYHOST with
your domain)

Development: For local development you can use: https://127.0.0.1:3000/rocket-meals/api/

# Configuration

## Hostname (MYHOST) für lokale Netzwerkzugriffe

Wenn du den Server im LAN zusätzlich zu `127.0.0.1` über einen Hostnamen erreichen willst, muss
`MYHOST` auf einen im Netzwerk auflösbaren Namen zeigen (DNS, mDNS/Bonjour oder ein Eintrag in
`/etc/hosts`). Beispiel zum Prüfen der Namensauflösung:

```bash
ping raspberry-pi-4-nils
```

Falls dein Netzwerk mDNS nutzt, funktioniert oft auch:

```bash
ping raspberry-pi-4-nils.local
```

## Whitelist Redirects

- In the Backend at `App Settings` under `Redirect Whitelist` add:
  - For expo: `exp://*`
  - For our GitHub Page: `https://rocket-meals.github.io/<subdomain>/`
  - For our app: `app-rocket-meals-<subdomain>://*`

# Server Installtion

Similar steps can be made for local testing

- Create a New Repo for each customer
- Strato Server einrichten
  - Domain Umleiten:
    - Domainverwaltung
      - Subdomain anlegen
      - DNS-Verwaltung
        - A-Record
          - Eigene IP-Adresse:
            - Server IP eintragen
- Debian 11
  - Public SSH Key Bei Strato hinterlegen
    - `cat ~/.ssh/id_rsa.pub`
  - Get Project from GitHub:
    - If you already have the project you can skip this
    - Install Git
      - `sudo apt install git`
    - Create a new GitHub Repo forked from "https://github.com/rocket-meals/rocket-meals"
      - Clone the Repo
        - `git clone <Your Rocket Meals Repo>`
  - At this step you should have the RocketMeals Repo on your Server
  - Add Sudo Users
    - in `/rocket-meals/backend/` is the file `add_user_to_sudo.sh`
      - run `./add_user_to_sudo.sh`
      - Enable passwordless sudo
        - `sudo visudo`
        - comment out the line: `# %sudo ALL=(ALL:ALL) ALL`
        - add the line: `%sudo ALL=(ALL:ALL) NOPASSWD: ALL`
  - Enter "rocket-meals" folder
    - `cd rocket-meals`
    - Enter the Backend Folder
      - `cd backend`
      - Install Docker and Docker-Compose
        - `./install-docker.sh`
        - Check if Docker is installed
          - `docker --version` should return a "26.1.3"
          - `docker compose --version` should return "Docker Compose version v2.27.1"
      - Go back to "rocket-meals" folder
        - `cd ..`
    - Install nvm and nodejs
      - Remove any other nodejs: `sudo apt auto-remove nodejs`
      - Install nvm:
        `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash`
        - nvm install 18
        - nvm use 18
        - nvm alias default 18
          - If you get an error: Node not found, try: sudo ln -s
            /root/.nvm/versions/node/v18.19.1/bin/node /usr/local/bin/node
  - Prepare Backend
    - Configure `.env` in "/rocket-meals"
      - nano .env
        - Change the following:
          - MYHOST: "subdomain.domain.de" where your server is running on
          - RESOLVER: change to "myresolver" for production
          - ADMIN_EMAIL: your email
          - ADMIN_PASSWORD: your password
        - Configure the rest if you are using SSO and the email service
    - SSL for HTTPS:
      - Set the ssl cert permission to 600: `chmod 600 ./proxy/letsencrypt/acme.json`
    - Database Permissions
      - `cd ./backend && ./permissionDatabase.sh && cd ..`
  - Start the backend:
    - `docker-compose up`
    - Wait until the backend is started. At the first start you will see some errors as the database
      is not yet created and the ssl certificates are not yet created.
    - Check if your backend can be reached: `https://<MYHOST>/rocket-meals/api/`
    - Migrate to the latest version
  - Migrate to the latest version
    - On your local machine or on the server go into: `rocket-meals/backend/sync`
      - run: `./push.sh`
  - Mobile App Configuration:
    - If you already setup your server go to "app-settings" table
      - Change the "redirect settings" and add your "scheme" of your app:
        - `app-rocket-meals` which you can find in the `app.json` file

## Configure Directus

- `docker-compose build`
- `docker-compose up`
- Enable Extension: Types
  - `http://127.0.0.1/rocket-meals/api/admin/settings/project`
    - Check "Generate Types" Extension

## Configure SSO

- Check that a role for "User" exists
  - Permissions for User configured:
    - Permission: Delete User: Custom: Rule: ID equals $CURRENT_USER
    - Other Permissions
  - Copy the RoleId (in the url)
  -
- open docker-compose.yaml
- use Directus docks for adding new SSO
  https://docs.directus.io/configuration/config-options/#sso-oauth2-and-openid

## Contributing - Database Schema

- Read the file at ./Backend/README.md

### Apple SSO

Since the SSO for Apple is a bit more to do, read the file: "SSO_APPLE.md"

### Email-Invites

#### Email-SMTP-Setup Strato

## Troublshooting

### SQLITE_READONLY: attempt to write a readonly database

```
SQLITE_READONLY: attempt to write a readonly database
```

run the `./permissionDatabase.sh` script.

### SQLITE_BUSY: typically after restart

Server seems to be stopped during an transaction See for a "-journal.db" file and delete it.

#### SSO Login error

```
{"errors":[{"message":"Route /undefinedvcl4421NN-JEZAVRZcD24tyAbRwgCb6DzCt5JkeuFFzlZTkJi3gtsZryOHZFJcjJ doesn't exist.","extensions":{"code":"ROUTE_NOT_FOUND"}}]}
```

Check if the RoleId for the SSO-User is set correctly in the `docker-compose.yaml` file. The RoleId
can be found in `.env` or in the `docker-compose.yaml` file.

## Project Settings

- Default Rocket Meals Color: #EE581F

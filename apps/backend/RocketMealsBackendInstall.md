# RocketMealsBackend - Strato

- Stato V Server mieten
  - NICHT! Ubuntu 22 (Das klappt nicht mit dem Docker-Script)
    - Stattdessen Ubuntu 20 oder Debian

- Domain Umleiten:
  - Domainverwaltung
    - Subdomain anlegen
    - DNS-Verwaltung
      - A-Record
        - Eigene IP-Adresse:
        - Server IP eintragen

- Cockpit installieren:
  - `sudo apt update`

```
. /etc/os-release
sudo apt install -t ${VERSION_CODENAME}-backports cockpit
```

(https://cockpit-project.org/running#ubuntu)

- `sudo systemctl enable --now cockpit.socket`

- `adduser USERNAME`
  - Where `USERNAME` is your username
- `usermod -aG sudo USERNAME`
  - Where `USERNAME` is your username

- Open Browser: `https://ip-address-of-machine:9090`
  - Login with your username
  - Optional: Update Packages

- GitHub:
  - Profile
  - Sidebar: Developer Settings
    - Personal access tokens
    - Tokens classic
    - Generate new token
    - Use as login for git clone

- Terminal
  - `sudo su`

  - Docker version 24.0.2, build cb74dfc
  - docker-compose version 1.29.2, build 5becea4c
  - `sudo apt-get purge docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras`
    (https://docs.docker.com/engine/install/ubuntu/)
    - `sudo su -l $USER`
    - `sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose`
    - `sudo chmod +x /usr/local/bin/docker-compose`

root@h2948503:/home/nbaumgartner# docker -v Docker version 20.10.8, build 3967b7d
root@h2948503:/home/nbaumgartner# docker-compose -v docker-compose version 1.29.2, build 5becea4c
root@h2948503:/home/nbaumgartner#

    - `git clone https://github.com/FireboltCasters/Server-Toplevel-Proxy`
    	- `nano .env`
    	- MYHOST in die (Sub)-Domain ändern

    - `git clone REPO_URL`

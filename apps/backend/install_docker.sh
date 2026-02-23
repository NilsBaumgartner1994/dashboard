#!/bin/bash

# Update package index
apt update

# Install prerequisite packages
apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's GPG key
curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -

# Add Docker's APT repository
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable"

# Update the package database with the new repo
apt update

# Install Docker
apt install -y docker-ce

# Enable and start the Docker service
systemctl enable docker
systemctl start docker

# Download the latest version of Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Apply executable permissions to the binary
chmod +x /usr/local/bin/docker-compose

# Print Docker and Docker Compose versions
docker --version
docker-compose --version

echo "Docker and Docker Compose installed successfully."

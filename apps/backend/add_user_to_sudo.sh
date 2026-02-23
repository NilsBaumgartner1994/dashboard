#!/bin/bash

# Check if the script is run as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root" 1>&2
    exit 1
fi

# Check for correct number of arguments
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 username 'ssh-rsa AAA...'" 1>&2
    exit 1
fi

# Extract arguments
USERNAME=$1
SSH_KEY=$2

# Create the new user and add the user to the sudo group
adduser --disabled-password --gecos "" $USERNAME
usermod -aG sudo $USERNAME

# Set up the user's SSH key
mkdir -p /home/$USERNAME/.ssh
echo $SSH_KEY > /home/$USERNAME/.ssh/authorized_keys
chmod 700 /home/$USERNAME/.ssh
chmod 600 /home/$USERNAME/.ssh/authorized_keys
chown -R $USERNAME:$USERNAME /home/$USERNAME/.ssh

echo "User $USERNAME added successfully and added to sudo group."

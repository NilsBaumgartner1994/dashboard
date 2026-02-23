#!/bin/bash
echo "Delete all containers"
docker rm -vf $(docker-compose ps -q 'directus')
echo "Delete directus images"
docker rmi $(docker images | grep 'directus')
#docker rmi -f $(docker images -aq)
echo "Finished"

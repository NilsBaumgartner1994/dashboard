# Use ARG to allow dynamic versioning
ARG POSTGIS_VERSION=13-3.4

# Base the image on the specific version of PostGIS
FROM postgis/postgis:${POSTGIS_VERSION}

# Maintainer info
MAINTAINER Your Name <your.email@example.com>

# Install cron
RUN apt-get update && \
    apt-get install -y cron && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add the backup scripts to the container
COPY dump.sh /dump.sh
RUN chmod +x /dump.sh

COPY start.sh /start.sh
RUN chmod +x /start.sh

# Set the volume for storing dumps
VOLUME /dump

# Set the entrypoint to the start script
ENTRYPOINT ["/start.sh"]
CMD [""]

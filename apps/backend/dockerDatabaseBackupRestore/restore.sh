#!/bin/bash

# Ensure all required environment variables are set
: "${PGUSER:?Need to set PGUSER}"
: "${PGPASSWORD:?Need to set PGPASSWORD}"
: "${PGDB:?Need to set PGDB}"
: "${PGHOST:?Need to set PGHOST}"
: "${BACKUP_FILE:?Need to set BACKUP_FILE}"

echo 'Starting database restore process'
echo 'Files available in /dump/:'
ls -l /dump/
echo "Attempting to restore from /dump/${BACKUP_FILE}"

if [[ -f "/dump/${BACKUP_FILE}" ]]; then
  echo 'Backup file found'
  echo 'Using the following environment variables:'
  echo "PGUSER: $PGUSER"
  echo "PGPASSWORD: $PGPASSWORD"
  echo "PGDB: $PGDB"
  echo "PGHOST: $PGHOST"

  # Drop the existing database (connect to 'postgres' database for this operation)
  echo "Dropping the existing database $PGDB"
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d postgres -c "DROP DATABASE IF EXISTS $PGDB;" || { echo 'Failed to drop database'; exit 1; }

  # Recreate the database
  echo "Creating a new database $PGDB"
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d postgres -c "CREATE DATABASE $PGDB;" || { echo 'Failed to create database'; exit 1; }

  # Verify the database was created successfully
  echo "Verifying the database $PGDB was created"
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDB -c "\l" || { echo 'Failed to connect to the new database'; exit 1; }

  # Restore the database
  if [[ ${BACKUP_FILE} == *.gz ]]; then
    echo 'Decompressing and restoring the gzipped SQL file'
    gunzip -c "/dump/${BACKUP_FILE}" | PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDB || { echo 'Failed to restore database'; exit 1; }
  else
    echo 'Restoring the plain SQL file'
    PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDB < "/dump/${BACKUP_FILE}" || { echo 'Failed to restore database'; exit 1; }
  fi

  echo 'Database restore completed successfully.'
else
  echo "Error: Backup file /dump/${BACKUP_FILE} not found!"
  exit 1
fi

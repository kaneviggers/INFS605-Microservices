#!/bin/sh

# Runs on first boot to create a database and a user for each service

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER course_user WITH PASSWORD '$COURSE_DB_PASSWORD';
  CREATE DATABASE course_db OWNER course_user;
  REVOKE CONNECT ON DATABASE course_db FROM PUBLIC;

  CREATE USER feedback_user WITH PASSWORD '$FEEDBACK_DB_PASSWORD';
  CREATE DATABASE feedback_db OWNER feedback_user;
  REVOKE CONNECT ON DATABASE feedback_db FROM PUBLIC;

  CREATE USER notification_user WITH PASSWORD '$NOTIFICATION_DB_PASSWORD';
  CREATE DATABASE notification_db OWNER notification_user;
  REVOKE CONNECT ON DATABASE notification_db FROM PUBLIC;
EOSQL
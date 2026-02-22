#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma db push --accept-data-loss --skip-generate

echo "Starting Next.js..."
exec "$@"

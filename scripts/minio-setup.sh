#!/usr/bin/env bash
# One-time MinIO setup: a private bucket and an app user that can only touch that bucket.
#   scripts/minio-setup.sh ~/minio-setup/minio.env
# The admin credentials are only used here; the app gets its own and they go into .env.
set -euo pipefail

ADMIN_ENV=${1:?usage: scripts/minio-setup.sh <file with MINIO_ROOT_USER and MINIO_ROOT_PASSWORD>}
MINIO_URL=${MINIO_URL:-https://s3.rfp11.com}
ENV_FILE=${ENV_FILE:-$(dirname "$0")/../.env}
BUCKET=${S3_BUCKET:-dnd-serpih}
APP_USER=${APP_USER:-dnd-app}
POLICY=dnd-serpih-rw
MC=${MC:-mc}

if grep -q '^S3_SECRET_KEY=' "$ENV_FILE" 2>/dev/null; then
  echo "$ENV_FILE already has S3_SECRET_KEY; nothing changed." >&2
  exit 1
fi

admin_user=$(grep -E '^MINIO_ROOT_USER=' "$ADMIN_ENV" | cut -d= -f2- | tr -d '"'"'")
admin_pass=$(grep -E '^MINIO_ROOT_PASSWORD=' "$ADMIN_ENV" | cut -d= -f2- | tr -d '"'"'")
scheme=${MINIO_URL%%://*}
# A throwaway alias through the environment, so nothing is saved to ~/.mc.
encode() { U="$1" node -p 'encodeURIComponent(process.env.U)'; }
export MC_HOST_dndsetup="$scheme://$(encode "$admin_user"):$(encode "$admin_pass")@${MINIO_URL#*://}"
unset admin_user admin_pass

"$MC" mb --ignore-existing "dndsetup/$BUCKET"
"$MC" anonymous set none "dndsetup/$BUCKET"

policy_file=$(mktemp)
trap 'rm -f "$policy_file"' EXIT
cat >"$policy_file" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::$BUCKET/*"]
    }
  ]
}
EOF

app_secret=$(openssl rand -hex 24)
"$MC" admin user add dndsetup "$APP_USER" "$app_secret" >/dev/null
"$MC" admin policy create dndsetup "$POLICY" "$policy_file" >/dev/null
"$MC" admin policy attach dndsetup "$POLICY" --user "$APP_USER" >/dev/null

{
  echo
  echo "# MinIO: private bucket for character sheets and map images; see README"
  echo "S3_ENDPOINT=$MINIO_URL"
  echo "S3_BUCKET=$BUCKET"
  echo "S3_ACCESS_KEY=$APP_USER"
  echo "S3_SECRET_KEY=$app_secret"
} >>"$ENV_FILE"

echo "Bucket \"$BUCKET\" and user \"$APP_USER\" are ready; credentials written to $ENV_FILE."
echo "Next: pnpm promo:upload-map"

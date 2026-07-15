#!/usr/bin/env bash
set -euo pipefail

aws ssm get-parameters-by-path \
  --path /app/prod \
  --with-decryption \
  --region us-east-1 \
  --query 'Parameters[].[Name,Value]' \
  --output text \
| while IFS=$'\t' read -r name value; do
    echo "${name##*/}=${value}"
  done > /opt/app/api.env

chmod 600 /opt/app/api.env

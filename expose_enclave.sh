# Copyright (c), Mysten Labs, Inc.
# SPDX-License-Identifier: Apache-2.0
#!/bin/bash

# Gets the enclave id and CID
# expects there to be only one enclave running
ENCLAVE_ID=$(nitro-cli describe-enclaves | jq -r ".[0].EnclaveID")
ENCLAVE_CID=$(nitro-cli describe-enclaves | jq -r ".[0].EnclaveCID")

sleep 5
# Secrets-block
# Set your secrets here
API_KEY="###"
ACCESS_KEY="###"
STORAGE_ACCESS_KEY_ID="###"
STORAGE_SECRET_ACCESS_KEY="###"
ADMIN_SECRET="###"
SCOOPER_URL="###"
SCOOPER_SECRET="###"
FRONTEND_URL="https://www.perma.ws"

# Create secrets.json
cat > secrets.json <<EOF
{
  "API_KEY": "$API_KEY",
  "ACCESS_KEY": "$ACCESS_KEY",
  "STORAGE_ACCESS_KEY_ID": "$STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY": "$STORAGE_SECRET_ACCESS_KEY",
  "ADMIN_SECRET": "$ADMIN_SECRET",
  "SCOOPER_URL": "$SCOOPER_URL",
  "SCOOPER_SECRET": "$SCOOPER_SECRET",
  "FRONTEND_URL": "$FRONTEND_URL"
}
EOF
# This section will be populated by configure_enclave.sh based on secret configuration

cat secrets.json | socat - VSOCK-CONNECT:$ENCLAVE_CID:7777
socat TCP4-LISTEN:3000,reuseaddr,fork VSOCK-CONNECT:$ENCLAVE_CID:3000 &

# Additional port configurations will be added here by configure_enclave.sh if needed

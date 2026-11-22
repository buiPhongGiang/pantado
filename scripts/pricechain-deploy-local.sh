#!/usr/bin/env bash
# Deploys the Pantado Price Chain contracts on the local Avalanche network (phase 1):
#   PriceReports on the L1, PriceChainReceiver on the C-Chain, wired to each other through ICM.
# Prerequisite: `avalanche blockchain deploy pantadoprice --local` is running.
# Env: PRICECHAIN_L1_RPC (the L1 RPC printed by the deploy), PRICECHAIN_DEPLOYER_KEY (the local network's funded
#      test key). Writes contracts/deployments/pricechain-local.json and the reporter keys to .env.pricechain.local
#      (git-ignored; local test keys only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/config/pricechain.json"
: "${PRICECHAIN_L1_RPC:?set PRICECHAIN_L1_RPC}"
: "${PRICECHAIN_DEPLOYER_KEY:?set PRICECHAIN_DEPLOYER_KEY}"
j() { python3 -I -c "import json,sys;d=json.load(open('$CFG'));print(eval(sys.argv[1]))" "$1"; }
L1="$PRICECHAIN_L1_RPC"
C="$(j "d['networks']['local']['cchain']['rpc']")"
MSG="$(j "d['networks']['local']['icmMessenger']")"
L1_ID="$(j "d['networks']['local']['l1']['blockchainIdHex']")"
C_ID="$(j "d['networks']['local']['cchain']['blockchainIdHex']")"
ROUND="$(j "d['roundSec']")"; THRESHOLD="$(j "d['threshold']")"; N="$(j "d['reporters']")"; GAS="$(j "d['destinationGasLimit']")"
KEY="$PRICECHAIN_DEPLOYER_KEY"
OWNER="$(cast wallet address --private-key "$KEY")"

cd "$ROOT/contracts"
deploy() { forge create "$1" --rpc-url "$2" --private-key "$KEY" --broadcast --constructor-args "${@:3}" 2>&1 | awk '/Deployed to:/{print $3}'; }
REPORTS="$(deploy src/pricechain/PriceReports.sol:PriceReports "$L1" "$OWNER" "$MSG" "$ROUND")"
RECEIVER="$(deploy src/pricechain/PriceChainReceiver.sol:PriceChainReceiver "$C" "$OWNER" "$MSG")"
echo "PriceReports (L1)        $REPORTS"
echo "PriceChainReceiver (C)   $RECEIVER"

ENVF="$ROOT/.env.pricechain.local"
: > "$ENVF"
KEYS=()
for i in $(seq 1 "$N"); do
  k="0x$(openssl rand -hex 32)"; a="$(cast wallet address --private-key "$k")"
  KEYS+=("$k")
  cast send --rpc-url "$L1" --private-key "$KEY" "$a" --value 5000ether >/dev/null  # ~0.15 PPC per report at 6M gas: weeks of rounds
  cast send --rpc-url "$L1" --private-key "$KEY" "$REPORTS" "setReporter(address,bool)" "$a" true >/dev/null
  echo "reporter $i               $a"
done
echo "PRICECHAIN_REPORTER_KEYS=$(IFS=,; echo "${KEYS[*]}")" >> "$ENVF"
cast send --rpc-url "$L1" --private-key "$KEY" "$REPORTS" "setThreshold(uint256)" "$THRESHOLD" >/dev/null
cast send --rpc-url "$L1" --private-key "$KEY" "$REPORTS" "setDestination(bytes32,address,uint256)" "$C_ID" "$RECEIVER" "$GAS" >/dev/null
cast send --rpc-url "$C" --private-key "$KEY" "$RECEIVER" "setSource(bytes32,address)" "$L1_ID" "$REPORTS" >/dev/null

mkdir -p "$ROOT/contracts/deployments"
cat > "$ROOT/contracts/deployments/pricechain-local.json" <<EOF
{
  "network": "local",
  "l1": { "chainId": $(cast chain-id --rpc-url "$L1"), "priceReports": "$REPORTS" },
  "cchain": { "chainId": $(cast chain-id --rpc-url "$C"), "receiver": "$RECEIVER" },
  "owner": "$OWNER",
  "threshold": $THRESHOLD,
  "reporters": $N
}
EOF
echo "wrote contracts/deployments/pricechain-local.json and .env.pricechain.local"

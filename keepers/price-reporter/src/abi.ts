/** The PriceReports calls the reporter uses (contracts/src/pricechain/PriceReports.sol). */
export const priceReportsAbi = [
  { type: "error", name: "NotReporter", inputs: [{ type: "address" }] },
  { type: "error", name: "BadRound", inputs: [{ type: "uint64" }] },
  { type: "error", name: "AlreadySubmitted", inputs: [{ type: "uint64" }, { type: "address" }] },
  { type: "error", name: "RoundFinal", inputs: [{ type: "uint64" }] },
  { type: "error", name: "LengthMismatch", inputs: [] },
  { type: "error", name: "NoAssets", inputs: [] },
  { type: "function", name: "currentRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "finalized", stateMutability: "view", inputs: [{ type: "uint64" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "submitters", stateMutability: "view", inputs: [{ type: "uint64" }], outputs: [{ type: "address[]" }] },
  { type: "function", name: "isReporter", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "round", type: "uint64" },
      { name: "ids", type: "bytes32[]" },
      { name: "prices", type: "uint256[]" },
      { name: "ts", type: "uint64[]" },
    ],
    outputs: [],
  },
] as const;

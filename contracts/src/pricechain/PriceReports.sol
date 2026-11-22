// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITeleporterMessenger, TeleporterFeeInfo, TeleporterMessageInput} from "./ITeleporter.sol";

/// @title PriceReports
/// @notice Runs on the Pantado Price Chain (an Avalanche L1). Registered reporters each submit the prices they
///         read for a round (one round per `roundSec`). When `threshold` distinct reporters have submitted the
///         same round, the median price of every asset is final: it is stored here (the chain keeps every round)
///         and sent to the Pantado receiver on the C-Chain through Avalanche ICM. A reporter's prices for an asset
///         count only if it reported that asset; an asset with fewer than `threshold` reports is not finalized.
///         Prices: USD per whole asset, 1e18 fixed point. `ts` is the market time the reporter read the price at.
contract PriceReports is Ownable {
    error NotReporter(address who);
    error BadRound(uint64 round);
    error AlreadySubmitted(uint64 round, address reporter);
    error RoundFinal(uint64 round);
    error LengthMismatch();
    error BadThreshold(uint256 threshold, uint256 reporters);
    error NoAssets();

    struct Report {
        bytes32[] ids;
        uint256[] prices;
        uint64[] ts;
    }

    struct Price {
        uint256 priceE18;
        uint64 ts;
        uint64 round;
    }

    ITeleporterMessenger public immutable messenger;
    uint64 public immutable roundSec;

    bytes32 public destinationBlockchainId;
    address public destination;
    uint256 public destinationGasLimit;

    uint256 public threshold;
    mapping(address => bool) public isReporter;
    address[] public reporters;

    mapping(uint64 => address[]) private _submitters;
    mapping(uint64 => mapping(address => Report)) private _reports;
    mapping(uint64 => bool) public finalized;
    mapping(bytes32 => Price) public latest;
    uint64 public lastFinalRound;
    mapping(address => bool) private _knownReporter;

    event ReporterSet(address indexed reporter, bool active);
    event ThresholdSet(uint256 threshold);
    event DestinationSet(bytes32 blockchainId, address destination, uint256 gasLimit);
    event Submitted(uint64 indexed round, address indexed reporter, uint256 assets);
    event Finalized(uint64 indexed round, uint256 assets, bytes32 messageId);
    event PriceFinal(bytes32 indexed id, uint64 indexed round, uint256 priceE18, uint64 ts);

    constructor(address owner_, ITeleporterMessenger messenger_, uint64 roundSec_) Ownable(owner_) {
        messenger = messenger_;
        roundSec = roundSec_;
    }

    // ------------------------------------------------------------------ admin (PoA phase; partners later)

    function setReporter(address reporter, bool active) external onlyOwner {
        if (active && !_knownReporter[reporter]) {
            _knownReporter[reporter] = true;
            reporters.push(reporter);
        }
        isReporter[reporter] = active;
        emit ReporterSet(reporter, active);
    }

    function setThreshold(uint256 t) external onlyOwner {
        if (t == 0 || t > activeReporters()) revert BadThreshold(t, activeReporters());
        threshold = t;
        emit ThresholdSet(t);
    }

    function setDestination(bytes32 blockchainId, address dest, uint256 gasLimit) external onlyOwner {
        destinationBlockchainId = blockchainId;
        destination = dest;
        destinationGasLimit = gasLimit;
        emit DestinationSet(blockchainId, dest, gasLimit);
    }

    function activeReporters() public view returns (uint256 n) {
        for (uint256 i; i < reporters.length; ++i) if (isReporter[reporters[i]]) ++n;
    }

    // ------------------------------------------------------------------ reporting

    /// @notice Current round number (block time / roundSec).
    function currentRound() public view returns (uint64) {
        return uint64(block.timestamp / roundSec);
    }

    function submit(uint64 round, bytes32[] calldata ids, uint256[] calldata prices, uint64[] calldata ts) external {
        if (!isReporter[msg.sender]) revert NotReporter(msg.sender);
        uint64 cur = currentRound();
        // the current round, or the one before it (a report sent at the round boundary)
        if (round > cur || round + 1 < cur) revert BadRound(round);
        if (finalized[round]) revert RoundFinal(round);
        if (ids.length == 0) revert NoAssets();
        if (ids.length != prices.length || ids.length != ts.length) revert LengthMismatch();
        Report storage r = _reports[round][msg.sender];
        if (r.ids.length != 0) revert AlreadySubmitted(round, msg.sender);
        r.ids = ids;
        r.prices = prices;
        r.ts = ts;
        _submitters[round].push(msg.sender);
        emit Submitted(round, msg.sender, ids.length);
        if (_submitters[round].length >= threshold && threshold != 0) _finalize(round);
    }

    function _finalize(uint64 round) internal {
        finalized[round] = true;
        address[] storage subs = _submitters[round];
        Report storage first = _reports[round][subs[0]];
        uint256 n = first.ids.length;
        bytes32[] memory outIds = new bytes32[](n);
        uint256[] memory outPrices = new uint256[](n);
        uint64[] memory outTs = new uint64[](n);
        uint256 k;
        for (uint256 a; a < n; ++a) {
            bytes32 id = first.ids[a];
            uint256[] memory vals = new uint256[](subs.length);
            uint64 tsMax;
            uint256 m;
            for (uint256 s; s < subs.length; ++s) {
                Report storage r = _reports[round][subs[s]];
                for (uint256 j; j < r.ids.length; ++j) {
                    if (r.ids[j] == id) {
                        vals[m++] = r.prices[j];
                        if (r.ts[j] > tsMax) tsMax = r.ts[j];
                        break;
                    }
                }
            }
            if (m < threshold) continue; // not enough reporters agree this asset has a price
            uint256 med = _median(vals, m);
            if (med == 0) continue;
            if (round >= latest[id].round) latest[id] = Price(med, tsMax, round);
            emit PriceFinal(id, round, med, tsMax);
            outIds[k] = id;
            outPrices[k] = med;
            outTs[k] = tsMax;
            ++k;
        }
        assembly {
            mstore(outIds, k)
            mstore(outPrices, k)
            mstore(outTs, k)
        }
        if (round > lastFinalRound) lastFinalRound = round;
        bytes32 messageId;
        if (destination != address(0) && k > 0) {
            messageId = messenger.sendCrossChainMessage(
                TeleporterMessageInput({
                    destinationBlockchainID: destinationBlockchainId,
                    destinationAddress: destination,
                    feeInfo: TeleporterFeeInfo(address(0), 0),
                    requiredGasLimit: destinationGasLimit,
                    allowedRelayerAddresses: new address[](0),
                    message: abi.encode(round, outIds, outPrices, outTs)
                })
            );
        }
        emit Finalized(round, k, messageId);
    }

    /// @dev Median of the first `m` values (insertion sort; m is the reporter count, small).
    function _median(uint256[] memory v, uint256 m) internal pure returns (uint256) {
        for (uint256 i = 1; i < m; ++i) {
            uint256 x = v[i];
            uint256 j = i;
            while (j > 0 && v[j - 1] > x) {
                v[j] = v[j - 1];
                --j;
            }
            v[j] = x;
        }
        return m % 2 == 1 ? v[m / 2] : (v[m / 2 - 1] + v[m / 2]) / 2;
    }

    // ------------------------------------------------------------------ views

    function submitters(uint64 round) external view returns (address[] memory) {
        return _submitters[round];
    }

    function reportOf(uint64 round, address reporter)
        external
        view
        returns (bytes32[] memory ids, uint256[] memory prices, uint64[] memory ts)
    {
        Report storage r = _reports[round][reporter];
        return (r.ids, r.prices, r.ts);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITeleporterReceiver} from "./ITeleporter.sol";

/// @title PriceChainReceiver
/// @notice Runs on the C-Chain. Accepts finalized prices only from the PriceReports contract on the Pantado Price
///         Chain, delivered by the ICM messenger, and keeps the newest round per asset for Pantado to read.
contract PriceChainReceiver is ITeleporterReceiver, Ownable {
    error NotMessenger(address who);
    error WrongSource(bytes32 blockchainId, address sender);

    struct Price {
        uint256 priceE18;
        uint64 ts;
        uint64 round;
    }

    address public immutable messenger;
    bytes32 public sourceBlockchainId;
    address public sourceSender;

    mapping(bytes32 => Price) public latest;
    uint64 public lastRound;

    event SourceSet(bytes32 blockchainId, address sender);
    event PriceReceived(bytes32 indexed id, uint64 indexed round, uint256 priceE18, uint64 ts);

    constructor(address owner_, address messenger_) Ownable(owner_) {
        messenger = messenger_;
    }

    function setSource(bytes32 blockchainId, address sender) external onlyOwner {
        sourceBlockchainId = blockchainId;
        sourceSender = sender;
        emit SourceSet(blockchainId, sender);
    }

    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        if (msg.sender != messenger) revert NotMessenger(msg.sender);
        if (sourceBlockchainID != sourceBlockchainId || originSenderAddress != sourceSender) {
            revert WrongSource(sourceBlockchainID, originSenderAddress);
        }
        (uint64 round, bytes32[] memory ids, uint256[] memory prices, uint64[] memory ts) =
            abi.decode(message, (uint64, bytes32[], uint256[], uint64[]));
        for (uint256 i; i < ids.length; ++i) {
            // rounds can arrive out of order: keep the newest
            if (round < latest[ids[i]].round) continue;
            latest[ids[i]] = Price(prices[i], ts[i], round);
            emit PriceReceived(ids[i], round, prices[i], ts[i]);
        }
        if (round > lastRound) lastRound = round;
    }

    /// @notice Newest price of `id` (USD per whole asset, 1e18), its market time and round.
    function priceOf(bytes32 id) external view returns (uint256 priceE18, uint64 ts, uint64 round) {
        Price memory p = latest[id];
        return (p.priceE18, p.ts, p.round);
    }
}

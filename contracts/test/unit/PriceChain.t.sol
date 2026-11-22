// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PriceReports} from "../../src/pricechain/PriceReports.sol";
import {PriceChainReceiver} from "../../src/pricechain/PriceChainReceiver.sol";
import {ITeleporterMessenger, TeleporterMessageInput} from "../../src/pricechain/ITeleporter.sol";

/// @dev Records the last ICM message instead of sending it.
contract MockMessenger is ITeleporterMessenger {
    bytes32 public lastDest;
    address public lastTo;
    bytes public lastMessage;
    uint256 public sent;

    function sendCrossChainMessage(TeleporterMessageInput calldata m) external returns (bytes32) {
        lastDest = m.destinationBlockchainID;
        lastTo = m.destinationAddress;
        lastMessage = m.message;
        ++sent;
        return keccak256(abi.encode(sent));
    }
}

contract PriceChainTest is Test {
    PriceReports reports;
    PriceChainReceiver receiver;
    MockMessenger messenger;
    address owner = address(0xA11CE);
    address r1 = address(0x1);
    address r2 = address(0x2);
    address r3 = address(0x3);
    bytes32 constant L1 = bytes32(uint256(0x1278));
    bytes32 constant CCHAIN = bytes32(uint256(0x0a19));
    bytes32 constant FPT = bytes32("fpt");
    bytes32 constant VCB = bytes32("vcb");

    function setUp() public {
        vm.warp(1_800_000_000);
        messenger = new MockMessenger();
        reports = new PriceReports(owner, messenger, 60);
        receiver = new PriceChainReceiver(owner, address(messenger));
        vm.startPrank(owner);
        reports.setReporter(r1, true);
        reports.setReporter(r2, true);
        reports.setReporter(r3, true);
        reports.setThreshold(2);
        reports.setDestination(CCHAIN, address(receiver), 1_000_000);
        receiver.setSource(L1, address(reports));
        vm.stopPrank();
    }

    function _one(bytes32 id, uint256 p, uint64 t)
        internal
        pure
        returns (bytes32[] memory ids, uint256[] memory ps, uint64[] memory ts)
    {
        ids = new bytes32[](1);
        ps = new uint256[](1);
        ts = new uint64[](1);
        ids[0] = id;
        ps[0] = p;
        ts[0] = t;
    }

    function _two(uint256 pf, uint256 pv) internal view returns (bytes32[] memory ids, uint256[] memory ps, uint64[] memory ts) {
        ids = new bytes32[](2);
        ps = new uint256[](2);
        ts = new uint64[](2);
        (ids[0], ids[1]) = (FPT, VCB);
        (ps[0], ps[1]) = (pf, pv);
        (ts[0], ts[1]) = (uint64(block.timestamp), uint64(block.timestamp));
    }

    function test_finalizesAtThresholdWithMedianAndSendsIcm() public {
        uint64 round = reports.currentRound();
        (bytes32[] memory ids, uint256[] memory a, uint64[] memory t) = _two(1.75e18, 1.96e18);
        vm.prank(r1);
        reports.submit(round, ids, a, t);
        assertFalse(reports.finalized(round));
        assertEq(messenger.sent(), 0);
        (, uint256[] memory b,) = _two(1.77e18, 1.94e18);
        vm.prank(r2);
        reports.submit(round, ids, b, t);
        assertTrue(reports.finalized(round));
        (uint256 p,, uint64 rd) = reports.latest(FPT);
        assertEq(p, 1.76e18); // median of two = mean
        assertEq(rd, round);
        assertEq(messenger.sent(), 1);
        assertEq(messenger.lastDest(), CCHAIN);
        assertEq(messenger.lastTo(), address(receiver));
    }

    function test_medianOfThreeIgnoresOneBadReporter() public {
        vm.prank(owner);
        reports.setThreshold(3);
        uint64 round = reports.currentRound();
        (bytes32[] memory ids, uint64 t) = (new bytes32[](1), uint64(block.timestamp));
        ids[0] = FPT;
        uint64[] memory ts = new uint64[](1);
        ts[0] = t;
        uint256[] memory p = new uint256[](1);
        p[0] = 1.76e18;
        vm.prank(r1);
        reports.submit(round, ids, p, ts);
        p[0] = 99e18; // a wrong or dishonest report
        vm.prank(r2);
        reports.submit(round, ids, p, ts);
        p[0] = 1.75e18;
        vm.prank(r3);
        reports.submit(round, ids, p, ts);
        (uint256 med,,) = reports.latest(FPT);
        assertEq(med, 1.76e18);
    }

    function test_rejectsStrangersDoubleSubmitOldRoundsAndFinalRounds() public {
        uint64 round = reports.currentRound();
        (bytes32[] memory ids, uint256[] memory p, uint64[] memory t) = _one(FPT, 1e18, uint64(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(PriceReports.NotReporter.selector, address(0xBAD)));
        vm.prank(address(0xBAD));
        reports.submit(round, ids, p, t);
        vm.prank(r1);
        reports.submit(round, ids, p, t);
        vm.expectRevert(abi.encodeWithSelector(PriceReports.AlreadySubmitted.selector, round, r1));
        vm.prank(r1);
        reports.submit(round, ids, p, t);
        vm.expectRevert(abi.encodeWithSelector(PriceReports.BadRound.selector, round - 2));
        vm.prank(r2);
        reports.submit(round - 2, ids, p, t);
        vm.prank(r2);
        reports.submit(round, ids, p, t);
        vm.expectRevert(abi.encodeWithSelector(PriceReports.RoundFinal.selector, round));
        vm.prank(r3);
        reports.submit(round, ids, p, t);
    }

    function test_assetReportedByTooFewIsNotFinalized() public {
        uint64 round = reports.currentRound();
        (bytes32[] memory ids, uint256[] memory a, uint64[] memory t) = _two(1.75e18, 1.96e18);
        vm.prank(r1);
        reports.submit(round, ids, a, t);
        (bytes32[] memory only, uint256[] memory p, uint64[] memory t1) = _one(FPT, 1.77e18, uint64(block.timestamp));
        vm.prank(r2);
        reports.submit(round, only, p, t1);
        (uint256 f,,) = reports.latest(FPT);
        (uint256 v,,) = reports.latest(VCB);
        assertEq(f, 1.76e18);
        assertEq(v, 0); // only one reporter had VCB
    }

    function test_thresholdCannotExceedReporters() public {
        vm.expectRevert(abi.encodeWithSelector(PriceReports.BadThreshold.selector, 4, 3));
        vm.prank(owner);
        reports.setThreshold(4);
    }

    function test_reactivatedReporterCountsOnce() public {
        vm.startPrank(owner);
        reports.setReporter(r1, false);
        assertEq(reports.activeReporters(), 2);
        reports.setReporter(r1, true);
        assertEq(reports.activeReporters(), 3);
        vm.expectRevert(abi.encodeWithSelector(PriceReports.BadThreshold.selector, 4, 3));
        reports.setThreshold(4);
        vm.stopPrank();
    }

    function test_lateRoundKeepsNewerPricesAndFinalizesOtherAssets() public {
        uint64 olderRound = reports.currentRound();
        (bytes32[] memory olderIds, uint256[] memory olderPrices, uint64[] memory olderTimes) = _two(1.75e18, 1.96e18);
        vm.prank(r1);
        reports.submit(olderRound, olderIds, olderPrices, olderTimes);

        vm.warp(vm.getBlockTimestamp() + reports.roundSec());
        uint64 newerRound = reports.currentRound();
        uint64 newerTime = uint64(vm.getBlockTimestamp());
        (bytes32[] memory ids, uint256[] memory prices, uint64[] memory times) = _one(FPT, 1.77e18, newerTime);
        vm.prank(r1);
        reports.submit(newerRound, ids, prices, times);
        vm.prank(r2);
        reports.submit(newerRound, ids, prices, times);

        vm.prank(r2);
        reports.submit(olderRound, olderIds, olderPrices, olderTimes);

        assertTrue(reports.finalized(olderRound));
        assertEq(reports.lastFinalRound(), newerRound);
        (uint256 price, uint64 ts, uint64 round) = reports.latest(FPT);
        assertEq(price, 1.77e18);
        assertEq(ts, newerTime);
        assertEq(round, newerRound);
        (price, ts, round) = reports.latest(VCB);
        assertEq(price, 1.96e18);
        assertEq(ts, olderTimes[1]);
        assertEq(round, olderRound);
        assertEq(messenger.sent(), 2);
    }

    function test_receiverAcceptsOnlyTheMessengerAndTheSource() public {
        bytes32[] memory ids = new bytes32[](1);
        uint256[] memory p = new uint256[](1);
        uint64[] memory t = new uint64[](1);
        (ids[0], p[0], t[0]) = (FPT, 1.76e18, 100);
        bytes memory msg5 = abi.encode(uint64(5), ids, p, t);
        vm.expectRevert(abi.encodeWithSelector(PriceChainReceiver.NotMessenger.selector, address(this)));
        receiver.receiveTeleporterMessage(L1, address(reports), msg5);
        vm.prank(address(messenger));
        vm.expectRevert(abi.encodeWithSelector(PriceChainReceiver.WrongSource.selector, L1, address(0xBAD)));
        receiver.receiveTeleporterMessage(L1, address(0xBAD), msg5);
        vm.prank(address(messenger));
        receiver.receiveTeleporterMessage(L1, address(reports), msg5);
        (uint256 price, uint64 ts, uint64 round) = receiver.priceOf(FPT);
        assertEq(price, 1.76e18);
        assertEq(ts, 100);
        assertEq(round, 5);
        // an older round arriving late does not overwrite
        p[0] = 1.5e18;
        vm.prank(address(messenger));
        receiver.receiveTeleporterMessage(L1, address(reports), abi.encode(uint64(4), ids, p, t));
        (price,, round) = receiver.priceOf(FPT);
        assertEq(price, 1.76e18);
        assertEq(round, 5);
    }

    function test_endToEndMessageDecodesOnReceiver() public {
        uint64 round = reports.currentRound();
        (bytes32[] memory ids, uint256[] memory a, uint64[] memory t) = _two(1.75e18, 1.96e18);
        vm.prank(r1);
        reports.submit(round, ids, a, t);
        vm.prank(r2);
        reports.submit(round, ids, a, t);
        bytes memory m = messenger.lastMessage();
        vm.prank(address(messenger));
        receiver.receiveTeleporterMessage(L1, address(reports), m);
        (uint256 v,,) = receiver.priceOf(VCB);
        assertEq(v, 1.96e18);
        assertEq(receiver.lastRound(), round);
    }
}

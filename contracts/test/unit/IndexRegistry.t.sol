// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {IndexRegistry} from "../../src/core/IndexRegistry.sol";
import {PriceOracle} from "../../src/oracle/PriceOracle.sol";

/// @notice Indexes as data: create needs no funds, level starts at 100 and follows prices, every rebalance keeps the
///         level; manual (now or scheduled, assets may change), auto (interval or drift, anyone pokes) and drops.
contract IndexRegistryTest is Fixture {
    IndexRegistry internal reg;

    uint8 internal constant OFF = 0;
    uint8 internal constant MANUAL = 1;
    uint8 internal constant AUTO = 2;

    function setUp() public override {
        super.setUp();
        reg = new IndexRegistry(
            admin,
            address(registry),
            address(oracle),
            100e18,
            IndexRegistry.Limits({
                minAssets: 2,
                maxAssets: 20,
                minWeightBps: 100,
                maxPublicPerCreator: 2,
                minRebalanceSec: 1 days,
                driftMinBps: 1000,
                driftMaxBps: 20_000,
                minIntervalSec: 1 days,
                maxNoticeSec: 30 days,
                dropStaleSec: 7 days
            })
        );
    }

    // ---------------------------------------------------------------- helpers

    function _p(string memory ticker, bool isPublic) internal view returns (IndexRegistry.CreateParams memory p) {
        (address[] memory a, uint16[] memory w) = _assets3();
        p = IndexRegistry.CreateParams({
            name: "Data index",
            ticker: ticker,
            description: "",
            assets: a,
            weightsBps: w,
            isPublic: isPublic,
            mode: MANUAL,
            driftBps: 0,
            intervalSec: 0
        });
    }

    function _auto(string memory ticker, uint32 drift, uint64 interval) internal returns (address ix) {
        IndexRegistry.CreateParams memory p = _p(ticker, false);
        (p.mode, p.driftBps, p.intervalSec) = (AUTO, drift, interval);
        vm.prank(alice);
        ix = reg.create(p);
    }

    function _near(uint256 a, uint256 b) internal pure {
        uint256 d = a > b ? a - b : b - a;
        assertLe(d, 1e6, "within 1e-12 USD");
    }

    function _w3(uint16 a, uint16 b, uint16 c) internal pure returns (uint16[] memory w) {
        w = new uint16[](3);
        (w[0], w[1], w[2]) = (a, b, c);
    }

    function _same(address ix) internal view returns (address[] memory) {
        return reg.indexOf(ix).assets;
    }

    // ---------------------------------------------------------------- create and level

    function test_createNeedsNoFunds() public {
        assertEq(usdc.balanceOf(alice), 0);
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        assertEq(usdc.balanceOf(alice), 0);
        _near(reg.levelOf(ix), 100e18);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.creator, alice);
        assertEq(x.version, 1);
        assertEq(x.mode, MANUAL);
        assertEq(x.units.length, 3);
        assertTrue(reg.isTickerTaken("DATA"));
        assertEq(reg.indexes(0, 10)[0], ix);
    }

    function test_levelFollowsPrices() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        // wavax 20% +10%, btcb 50% −5%, wethe 30% +2% → 100 × (0.22 + 0.475 + 0.306) = 100.1
        _push(address(wavax), 6.51e18 * 110 / 100);
        _push(address(btcb), 74_357e18 * 95 / 100);
        _push(address(wethe), 2946e18 * 102 / 100);
        _near(reg.levelOf(ix), 100.1e18);
    }

    function test_validation() public {
        vm.startPrank(alice);
        reg.create(_p("DATA", true));
        vm.expectRevert(abi.encodeWithSelector(IndexRegistry.TickerTaken.selector, "DATA"));
        reg.create(_p("DATA", true));
        vm.expectRevert(IndexRegistry.BadTicker.selector);
        reg.create(_p("data", true));
        IndexRegistry.CreateParams memory p = _p("UNL", false);
        p.assets[0] = address(usdc);
        vm.expectRevert(abi.encodeWithSelector(IndexRegistry.UnlistedAsset.selector, address(usdc)));
        reg.create(p);
        p = _p("DUP", false);
        p.assets[1] = p.assets[0];
        vm.expectRevert(abi.encodeWithSelector(IndexRegistry.DuplicateAsset.selector, p.assets[0]));
        reg.create(p);
        p = _p("SUM", false);
        p.weightsBps[0] = 1000;
        vm.expectRevert(IndexRegistry.BadWeights.selector);
        reg.create(p);
        p = _p("MOD", false);
        (p.mode, p.driftBps, p.intervalSec) = (AUTO, 500, 1 days); // drift below the minimum
        vm.expectRevert(IndexRegistry.BadMode.selector);
        reg.create(p);
        (p.mode, p.driftBps, p.intervalSec) = (MANUAL, 5000, 0); // drift only for Auto
        vm.expectRevert(IndexRegistry.BadMode.selector);
        reg.create(p);
        vm.stopPrank();
    }

    function test_publicCapAndVisibility() public {
        vm.startPrank(alice);
        reg.create(_p("A1", true));
        reg.create(_p("A2", true));
        vm.expectRevert(abi.encodeWithSelector(IndexRegistry.TooManyPublic.selector, 2));
        reg.create(_p("A3", true));
        address priv = reg.create(_p("A4", false)); // private indexes are not capped
        vm.expectRevert(abi.encodeWithSelector(IndexRegistry.TooManyPublic.selector, 2));
        reg.makePublic(priv);
        vm.stopPrank();
        vm.prank(bob);
        address b = reg.create(_p("B1", false));
        vm.prank(alice);
        vm.expectRevert(IndexRegistry.NotCreator.selector);
        reg.makePublic(b);
        vm.startPrank(bob);
        reg.makePublic(b);
        assertTrue(reg.indexOf(b).isPublic);
        vm.expectRevert(IndexRegistry.AlreadyPublic.selector);
        reg.makePublic(b);
        vm.stopPrank();
    }

    function test_stalePriceBlocksCreateButNotLevel() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        _warp(2 hours);
        vm.prank(alice);
        vm.expectPartialRevert(PriceOracle.PriceStale.selector);
        reg.create(_p("LATE", true));
        _near(reg.levelOf(ix), 100e18); // views read the last price
    }

    // ---------------------------------------------------------------- manual

    function test_rebalanceNowKeepsLevel() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        _warp(1 days);
        _push(address(wavax), 6.51e18 * 2);
        _push(address(btcb), 74_357e18);
        _push(address(wethe), 2946e18);
        uint256 before = reg.levelOf(ix); // 120
        _near(before, 120e18);
        address[] memory a = _same(ix);
        vm.prank(alice);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "equal weight", 0);
        _near(reg.levelOf(ix), before);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.version, 2);
        assertEq(x.weightsBps[0], 3400);
        // after the rebalance wavax is 34% of the level: doubling it again adds 34%
        _push(address(wavax), 6.51e18 * 4);
        _push(address(btcb), 74_357e18);
        _push(address(wethe), 2946e18);
        _near(reg.levelOf(ix), before * 134 / 100);
    }

    function test_rebalanceChangesAssets() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        _warp(1 days);
        _refreshAll();
        _push(address(btcb), 74_357e18 * 110 / 100); // level 105
        uint256 before = reg.levelOf(ix);
        address[] memory a = new address[](2);
        (a[0], a[1]) = (address(btcb), address(six)); // drop wavax + wethe, add six
        uint16[] memory w = new uint16[](2);
        (w[0], w[1]) = (5000, 5000);
        vm.prank(alice);
        reg.rebalance(ix, a, w, "new basket", 0);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.assets.length, 2);
        assertEq(x.assets[1], address(six));
        _near(reg.levelOf(ix), before);
        _push(address(six), 12.5e18 * 2); // six doubled: +50% of the level
        _near(reg.levelOf(ix), before * 150 / 100);
    }

    function test_rebalanceRules() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        address[] memory a = _same(ix);
        vm.prank(bob);
        vm.expectRevert(IndexRegistry.NotCreator.selector);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "", 0);
        vm.prank(alice);
        vm.expectPartialRevert(IndexRegistry.TooSoon.selector);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "", 0);
        vm.prank(alice);
        vm.expectRevert(IndexRegistry.BadNotice.selector);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "", 31 days);
        _warp(1 days);
        _refreshAll();
        vm.prank(alice);
        vm.expectRevert(IndexRegistry.BadWeights.selector);
        reg.rebalance(ix, a, _w3(5000, 5000, 1), "", 0);
    }

    function test_scheduledRebalance() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        address[] memory a = _same(ix);
        vm.prank(alice);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "after notice", 2 days);
        assertEq(reg.pendingOf(ix).at, uint64(vm.getBlockTimestamp() + 2 days));
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.None));
        vm.expectRevert(IndexRegistry.NothingDue.selector);
        reg.poke(ix);
        _warp(2 days);
        _refreshAll();
        uint256 before = reg.levelOf(ix);
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.Pending));
        vm.prank(bob); // anyone applies it
        reg.poke(ix);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.version, 2);
        assertEq(x.weightsBps[0], 3400);
        assertEq(reg.pendingOf(ix).at, 0);
        _near(reg.levelOf(ix), before);
    }

    function test_cancelScheduled() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        address[] memory a = _same(ix);
        vm.prank(alice);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "", 2 days);
        vm.prank(bob);
        vm.expectRevert(IndexRegistry.NotCreator.selector);
        reg.cancelRebalance(ix);
        vm.prank(alice);
        reg.cancelRebalance(ix);
        _warp(3 days);
        _refreshAll();
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.None));
    }

    // ---------------------------------------------------------------- auto

    function test_autoByInterval() public {
        address ix = _auto("AUTO", 5000, 30 days);
        _warp(29 days);
        _refreshAll();
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.None));
        _warp(1 days);
        _push(address(wavax), 6.51e18 * 120 / 100); // small move, below the drift threshold
        _push(address(btcb), 74_357e18);
        _push(address(wethe), 2946e18);
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.Auto));
        uint256 before = reg.levelOf(ix);
        vm.prank(bob);
        reg.poke(ix);
        _near(reg.levelOf(ix), before);
        assertEq(reg.indexOf(ix).version, 2);
        assertLe(reg.maxDriftBps(ix), 1); // back on target
    }

    function test_autoByDrift() public {
        address ix = _auto("AUTO", 5000, 30 days);
        _warp(1 days);
        _refreshAll();
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.None));
        _push(address(wavax), 6.51e18 * 3); // wavax 20% → 42.9%: drift 114% ≥ 50%
        assertGe(reg.maxDriftBps(ix), 5000);
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.Auto));
        vm.prank(bob);
        reg.poke(ix);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.weightsBps[0], 2000);
        assertLe(reg.maxDriftBps(ix), 1);
        // not again before minRebalanceSec, even with a new drift
        _push(address(wavax), 6.51e18 * 4); // in band (×5 max)
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.None));
    }

    function test_autoWaitsForFreshPrices() public {
        address ix = _auto("AUTO", 5000, 1 days);
        _warp(2 days); // interval passed, but every price is stale
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.None));
    }

    function test_setMode() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        vm.prank(bob);
        vm.expectRevert(IndexRegistry.NotCreator.selector);
        reg.setMode(ix, AUTO, 5000, 30 days);
        vm.prank(alice);
        reg.setMode(ix, AUTO, 5000, 30 days);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.mode, AUTO);
        assertEq(x.intervalSec, 30 days);
    }

    // ---------------------------------------------------------------- drops

    function test_delistedAssetIsDropped() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        _push(address(wethe), 2946e18 * 110 / 100); // level 103
        uint256 before = reg.levelOf(ix);
        vm.prank(admin);
        reg.setDelisted(address(wethe), true);
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.Drop));
        vm.prank(bob);
        reg.poke(ix);
        IndexRegistry.Index memory x = reg.indexOf(ix);
        assertEq(x.assets.length, 2);
        assertEq(x.assets[0], address(wavax));
        assertEq(x.assets[1], address(btcb));
        // 20 / 50 → 2857 / 7143 (pro rata, sums to 10000)
        assertEq(x.weightsBps[0], 2857);
        assertEq(x.weightsBps[1], 7143);
        _near(reg.levelOf(ix), before);
        // a delisted asset cannot be used again
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IndexRegistry.UnlistedAsset.selector, address(wethe)));
        reg.create(_p("NEW", false));
    }

    function test_assetWithoutPriceIsDroppedAfterStaleWindow() public {
        vm.prank(alice);
        address ix = reg.create(_p("DATA", true));
        address[] memory a = _same(ix);
        vm.prank(alice);
        reg.rebalance(ix, a, _w3(3400, 3300, 3300), "", 10 days); // the drop cancels this
        _warp(7 days + 1);
        _push(address(wavax), 6.51e18);
        _push(address(btcb), 74_357e18); // wethe gets no price for 7 days
        assertEq(uint8(reg.due(ix)), uint8(IndexRegistry.Due.Drop));
        reg.poke(ix);
        assertEq(reg.indexOf(ix).assets.length, 2);
        assertEq(reg.pendingOf(ix).at, 0);
        _near(reg.levelOf(ix), 100e18);
    }
}

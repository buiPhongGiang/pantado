// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FixedPoint} from "../libraries/FixedPoint.sol";
import {IPriceOracle} from "../oracle/IPriceOracle.sol";
import {AssetRegistry} from "./AssetRegistry.sol";

/// @title IndexRegistry
/// @notice Indexes as data: a basket definition and a level computed from published prices. Creating an index
///         costs only gas; nothing is deposited, bought, sold or held. At creation the weights become fixed units
///         per asset so the level starts at `startLevel`; the level then follows the prices:
///         level = Σ units_i × price_i. Every rebalance re-derives the units at the current level, so the level is
///         continuous across it. Rebalancing:
///         - Manual: the creator publishes a new basket (assets and weights), at once or after a notice;
///         - Auto: anyone may `poke` the index when its interval has passed or an asset drifted past the threshold,
///           and it returns to its target weights;
///         - an asset that is delisted, or has had no price for `dropStaleSec`, is dropped by `poke` at its last
///           price and its weight goes pro rata to the others.
///         Anyone with a wallet can create; spam is bounded by unique tickers and a per-creator cap on public indexes.
contract IndexRegistry is Ownable {
    enum Mode {
        Off,
        Manual,
        Auto
    }

    /// @notice What `poke` would do now (in priority order).
    enum Due {
        None,
        Drop,
        Pending,
        Auto
    }

    struct Limits {
        uint8 minAssets;
        uint8 maxAssets;
        uint16 minWeightBps;
        uint16 maxPublicPerCreator;
        uint64 minRebalanceSec; // between two rebalances (creator or auto)
        uint32 driftMinBps;
        uint32 driftMaxBps;
        uint64 minIntervalSec; // shortest auto interval
        uint64 maxNoticeSec; // longest notice for a scheduled rebalance
        uint64 dropStaleSec; // an asset without a price for this long is dropped
    }

    struct CreateParams {
        string name;
        string ticker;
        string description;
        address[] assets;
        uint16[] weightsBps;
        bool isPublic;
        uint8 mode; // Mode
        uint32 driftBps; // Auto: relative drift |current − target| / target that triggers a rebalance
        uint64 intervalSec; // Auto: rebalance at least this often
    }

    struct Index {
        address creator;
        bool isPublic;
        uint8 mode;
        uint32 version;
        uint32 driftBps;
        uint64 intervalSec;
        uint64 createdAt;
        uint64 rebalancedAt;
        address[] assets;
        uint16[] weightsBps;
        uint256[] units; // whole tokens per index, 1e18 fixed point (independent of token decimals)
    }

    struct Pending {
        uint64 at; // 0 = none
        string reason;
        address[] assets;
        uint16[] weightsBps;
    }

    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_DESCRIPTION_BYTES = 1024;

    AssetRegistry public immutable assetRegistry;
    IPriceOracle public immutable oracle;
    /// @notice Level of every new index, USD 1e18.
    uint256 public immutable startLevel;
    Limits public limits;

    mapping(address index => Index) internal _index;
    mapping(address index => Pending) internal _pending;
    mapping(bytes32 tickerHash => address index) public indexByTicker;
    mapping(address creator => uint256) public publicCount;
    /// @notice Assets no longer usable (e.g. delisted from their exchange). Set by the owner for now; meant to move
    ///         to the price chain's validators.
    mapping(address asset => bool) public delisted;
    address[] internal _indexes;

    /// @dev Same signature as the vault factory's event, so readers handle both (the fee is 0).
    event IndexCreated(
        address indexed index,
        address indexed creator,
        string ticker,
        string name,
        string description,
        address[] assets,
        uint16[] weightsBps,
        uint8 mode,
        uint32 driftBps,
        bool isPublic,
        uint256 creationFee
    );
    /// @notice New basket and units (creation is version 1). `level` is the level they were derived at.
    event UnitsSet(
        address indexed index, uint32 version, address[] assets, uint16[] weightsBps, uint256[] units, uint256 level, string reason
    );
    event ModeSet(address indexed index, uint8 mode, uint32 driftBps, uint64 intervalSec);
    event RebalanceScheduled(address indexed index, address[] assets, uint16[] weightsBps, string reason, uint64 at);
    event RebalanceCancelled(address indexed index);
    event VisibilityChanged(address indexed index, bool isPublic);
    event Delisted(address indexed asset, bool delisted);
    event LimitsSet(Limits limits);

    error BadTicker();
    error TickerTaken(string ticker);
    error BadName();
    error BadAssetCount(uint256 count);
    error BadWeights();
    error BadMode();
    error UnlistedAsset(address asset);
    error DuplicateAsset(address asset);
    error NoPrice(address asset);
    error NotCreator();
    error NotIndex(address index);
    error AlreadyPublic();
    error TooManyPublic(uint256 cap);
    error TooSoon(uint64 nextAt);
    error BadNotice();
    error NothingDue();
    error NothingLeft();
    error ZeroAddress();

    constructor(address owner_, address assetRegistry_, address oracle_, uint256 startLevel_, Limits memory limits_)
        Ownable(owner_)
    {
        if (assetRegistry_ == address(0) || oracle_ == address(0) || startLevel_ == 0) revert ZeroAddress();
        assetRegistry = AssetRegistry(assetRegistry_);
        oracle = IPriceOracle(oracle_);
        startLevel = startLevel_;
        _setLimits(limits_);
    }

    // ================================================================ admin

    function setLimits(Limits calldata l) external onlyOwner {
        _setLimits(l);
    }

    function setDelisted(address asset, bool isDelisted) external onlyOwner {
        delisted[asset] = isDelisted;
        emit Delisted(asset, isDelisted);
    }

    function _setLimits(Limits memory l) internal {
        if (l.minAssets < 2 || l.minAssets > l.maxAssets || uint256(l.minWeightBps) * l.maxAssets > 10_000) {
            revert BadAssetCount(l.maxAssets);
        }
        if (l.driftMinBps == 0 || l.driftMinBps > l.driftMaxBps || l.minIntervalSec == 0 || l.dropStaleSec == 0) {
            revert BadMode();
        }
        limits = l;
        emit LimitsSet(l);
    }

    // ================================================================ create

    /// @notice Define an index. Needs a fresh price for every asset (reverts `PriceStale` otherwise).
    function create(CreateParams calldata p) external returns (address index) {
        Limits memory l = limits;
        if (!isValidTicker(p.ticker)) revert BadTicker();
        bytes32 th = keccak256(bytes(p.ticker));
        if (indexByTicker[th] != address(0)) revert TickerTaken(p.ticker);
        uint256 nameLen = bytes(p.name).length;
        if (nameLen == 0 || nameLen > MAX_NAME_BYTES || bytes(p.description).length > MAX_DESCRIPTION_BYTES) {
            revert BadName();
        }
        _checkBasket(p.assets, p.weightsBps, l);
        _checkMode(p.mode, p.driftBps, p.intervalSec, l);
        if (p.isPublic) _countPublic(msg.sender, l.maxPublicPerCreator);

        // an identifier, not a contract: stable, unique per registry and creation order
        index = address(uint160(uint256(keccak256(abi.encode(address(this), _indexes.length)))));
        Index storage x = _index[index];
        x.creator = msg.sender;
        x.isPublic = p.isPublic;
        x.mode = p.mode;
        x.driftBps = p.driftBps;
        x.intervalSec = p.intervalSec;
        x.createdAt = uint64(block.timestamp);
        indexByTicker[th] = index;
        _indexes.push(index);

        emit IndexCreated(index, msg.sender, p.ticker, p.name, p.description, p.assets, p.weightsBps, p.mode, p.driftBps, p.isPublic, 0);
        emit ModeSet(index, p.mode, p.driftBps, p.intervalSec);
        _apply(index, x, p.assets, p.weightsBps, startLevel, "create");
    }

    // ================================================================ creator

    /// @notice New basket (assets and weights). `noticeSec` 0 applies it now (at most once per `minRebalanceSec`);
    ///         otherwise it is scheduled and anyone applies it with `poke` once the notice has passed. A new schedule
    ///         replaces a pending one.
    function rebalance(
        address index,
        address[] calldata assets,
        uint16[] calldata weightsBps,
        string calldata reason,
        uint64 noticeSec
    ) external {
        Index storage x = _creatorOf(index);
        Limits memory l = limits;
        _checkBasket(assets, weightsBps, l);
        if (noticeSec > l.maxNoticeSec) revert BadNotice();
        if (noticeSec == 0) {
            uint64 nextAt = x.rebalancedAt + l.minRebalanceSec;
            if (block.timestamp < nextAt) revert TooSoon(nextAt);
            if (_pending[index].at != 0) _cancel(index);
            _apply(index, x, assets, weightsBps, _level(x, true), reason);
            return;
        }
        uint64 at = uint64(block.timestamp) + noticeSec;
        Pending storage pd = _pending[index];
        pd.at = at;
        pd.reason = reason;
        pd.assets = assets;
        pd.weightsBps = weightsBps;
        emit RebalanceScheduled(index, assets, weightsBps, reason, at);
    }

    function cancelRebalance(address index) external {
        _creatorOf(index);
        if (_pending[index].at == 0) revert NothingDue();
        _cancel(index);
    }

    function setMode(address index, uint8 mode, uint32 driftBps, uint64 intervalSec) external {
        Index storage x = _creatorOf(index);
        _checkMode(mode, driftBps, intervalSec, limits);
        x.mode = mode;
        x.driftBps = driftBps;
        x.intervalSec = intervalSec;
        emit ModeSet(index, mode, driftBps, intervalSec);
    }

    /// @notice Private → public. Public → private is not allowed.
    function makePublic(address index) external {
        Index storage x = _creatorOf(index);
        if (x.isPublic) revert AlreadyPublic();
        _countPublic(msg.sender, limits.maxPublicPerCreator);
        x.isPublic = true;
        emit VisibilityChanged(index, true);
    }

    // ================================================================ anyone

    /// @notice Do what is due for `index` (see `due`): drop unusable assets, apply a scheduled rebalance whose
    ///         notice has passed, or rebalance an Auto index back to its targets. Reverts `NothingDue` otherwise.
    function poke(address index) external returns (Due d) {
        Index storage x = _get(index);
        d = due(index);
        if (d == Due.None) revert NothingDue();
        if (d == Due.Drop) {
            _drop(index, x);
        } else if (d == Due.Pending) {
            Pending storage pd = _pending[index];
            address[] memory a = pd.assets;
            uint16[] memory w = pd.weightsBps;
            string memory reason = pd.reason;
            delete _pending[index];
            // assets may have been delisted during the notice: the basket is checked again
            _checkBasketMem(a, w, limits);
            _apply(index, x, a, w, _level(x, true), reason);
        } else {
            bool byTime = block.timestamp >= x.rebalancedAt + x.intervalSec;
            _apply(index, x, x.assets, x.weightsBps, _level(x, true), byTime ? "auto: interval" : "auto: drift");
        }
    }

    /// @notice What `poke` would do now. Auto needs every price fresh (drift is measured on them).
    function due(address index) public view returns (Due) {
        Index storage x = _get(index);
        for (uint256 i; i < x.assets.length; ++i) {
            if (_unusable(x.assets[i])) return Due.Drop;
        }
        uint64 at = _pending[index].at;
        if (at != 0 && block.timestamp >= at) return Due.Pending;
        if (x.mode != uint8(Mode.Auto) || block.timestamp < x.rebalancedAt + limits.minRebalanceSec) return Due.None;
        for (uint256 i; i < x.assets.length; ++i) {
            if (!oracle.isFresh(x.assets[i])) return Due.None;
        }
        if (block.timestamp >= x.rebalancedAt + x.intervalSec) return Due.Auto;
        return maxDriftBps(index) >= x.driftBps ? Due.Auto : Due.None;
    }

    // ================================================================ internals

    function _apply(
        address index,
        Index storage x,
        address[] memory a,
        uint16[] memory w,
        uint256 lvl,
        string memory reason
    ) internal {
        uint256 n = a.length;
        uint256[] memory u = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            uint256 px = oracle.getPrice(a[i]);
            if (px == 0) revert NoPrice(a[i]);
            // value of the units at this price = lvl × w_i
            u[i] = FixedPoint.divWad(FixedPoint.mulBps(lvl, w[i]), px);
        }
        x.version += 1;
        x.rebalancedAt = uint64(block.timestamp);
        x.assets = a;
        x.weightsBps = w;
        x.units = u;
        emit UnitsSet(index, x.version, a, w, u, lvl, reason);
    }

    /// @dev Remove unusable assets at their last price; their weight goes pro rata to the rest. The level does not
    ///      jump: the remaining legs are re-derived at the level valued on last prices.
    function _drop(address index, Index storage x) internal {
        uint256 n = x.assets.length;
        uint256 lvl;
        uint256 keep;
        uint256 keptBps;
        uint256[] memory px = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            (px[i],) = oracle.latest(x.assets[i]);
            lvl += FixedPoint.mulWad(x.units[i], px[i]);
            if (!_unusable(x.assets[i])) {
                keep += 1;
                keptBps += x.weightsBps[i];
            }
        }
        if (keep == 0) revert NothingLeft();
        address[] memory a = new address[](keep);
        uint16[] memory w = new uint16[](keep);
        uint256[] memory u = new uint256[](keep);
        uint256 j;
        uint256 given;
        for (uint256 i; i < n; ++i) {
            if (_unusable(x.assets[i])) continue;
            a[j] = x.assets[i];
            w[j] = j == keep - 1 ? uint16(10_000 - given) : uint16((uint256(x.weightsBps[i]) * 10_000) / keptBps);
            given += w[j];
            u[j] = FixedPoint.divWad(FixedPoint.mulBps(lvl, w[j]), px[i]);
            ++j;
        }
        if (_pending[index].at != 0) _cancel(index);
        x.version += 1;
        x.rebalancedAt = uint64(block.timestamp);
        x.assets = a;
        x.weightsBps = w;
        x.units = u;
        emit UnitsSet(index, x.version, a, w, u, lvl, "dropped: delisted or no price");
    }

    function _unusable(address asset) internal view returns (bool) {
        if (delisted[asset] || !assetRegistry.isListed(asset)) return true;
        (, uint256 updatedAt) = oracle.latest(asset);
        return updatedAt + limits.dropStaleSec < block.timestamp;
    }

    function _cancel(address index) internal {
        delete _pending[index];
        emit RebalanceCancelled(index);
    }

    function _checkBasket(address[] calldata a, uint16[] calldata w, Limits memory l) internal view {
        _checkBasketMem(a, w, l);
    }

    function _checkBasketMem(address[] memory a, uint16[] memory w, Limits memory l) internal view {
        uint256 n = a.length;
        if (n < l.minAssets || n > l.maxAssets) revert BadAssetCount(n);
        if (w.length != n) revert BadWeights();
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            if (delisted[a[i]] || !assetRegistry.isListed(a[i])) revert UnlistedAsset(a[i]);
            for (uint256 j; j < i; ++j) {
                if (a[j] == a[i]) revert DuplicateAsset(a[i]);
            }
            if (w[i] < l.minWeightBps) revert BadWeights();
            sum += w[i];
        }
        if (sum != 10_000) revert BadWeights();
    }

    function _checkMode(uint8 mode, uint32 driftBps, uint64 intervalSec, Limits memory l) internal pure {
        if (mode > uint8(Mode.Auto)) revert BadMode();
        if (mode == uint8(Mode.Auto)) {
            if (driftBps < l.driftMinBps || driftBps > l.driftMaxBps || intervalSec < l.minIntervalSec) revert BadMode();
        } else if (driftBps != 0 || intervalSec != 0) {
            revert BadMode();
        }
    }

    function _countPublic(address creator, uint256 cap) internal {
        if (publicCount[creator] >= cap) revert TooManyPublic(cap);
        publicCount[creator] += 1;
    }

    function _get(address index) internal view returns (Index storage x) {
        x = _index[index];
        if (x.creator == address(0)) revert NotIndex(index);
    }

    function _creatorOf(address index) internal view returns (Index storage x) {
        x = _get(index);
        if (x.creator != msg.sender) revert NotCreator();
    }

    function _level(Index storage x, bool fresh) internal view returns (uint256 v) {
        for (uint256 i; i < x.assets.length; ++i) {
            uint256 px;
            if (fresh) px = oracle.getPrice(x.assets[i]);
            else (px,) = oracle.latest(x.assets[i]);
            v += FixedPoint.mulWad(x.units[i], px);
        }
    }

    // ================================================================ views

    /// @notice 2–6 chars, A–Z / 0–9.
    function isValidTicker(string calldata t) public pure returns (bool) {
        bytes calldata b = bytes(t);
        if (b.length < 2 || b.length > 6) return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (!((c >= "A" && c <= "Z") || (c >= "0" && c <= "9"))) return false;
        }
        return true;
    }

    /// @notice Largest relative drift |current − target| / target over the basket, in bps, on the last prices.
    function maxDriftBps(address index) public view returns (uint256 worst) {
        Index storage x = _get(index);
        uint256 n = x.assets.length;
        uint256[] memory v = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            (uint256 px,) = oracle.latest(x.assets[i]);
            v[i] = FixedPoint.mulWad(x.units[i], px);
            total += v[i];
        }
        if (total == 0) return 0;
        for (uint256 i; i < n; ++i) {
            uint256 cur = (v[i] * 10_000 * 1e6) / total; // bps × 1e6 for precision
            uint256 tgt = uint256(x.weightsBps[i]) * 1e6;
            uint256 d = cur > tgt ? cur - tgt : tgt - cur;
            uint256 rel = (d * 10_000) / tgt;
            if (rel > worst) worst = rel;
        }
    }

    /// @notice Level from the last published prices (no freshness check), USD 1e18.
    function levelOf(address index) external view returns (uint256) {
        return _level(_get(index), false);
    }

    function indexOf(address index) external view returns (Index memory) {
        return _get(index);
    }

    function pendingOf(address index) external view returns (Pending memory) {
        return _pending[index];
    }

    function isTickerTaken(string calldata ticker) external view returns (bool) {
        return indexByTicker[keccak256(bytes(ticker))] != address(0);
    }

    function indexCount() external view returns (uint256) {
        return _indexes.length;
    }

    function indexes(uint256 offset, uint256 count) external view returns (address[] memory out) {
        uint256 n = _indexes.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + count > n ? n : offset + count;
        out = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = _indexes[i];
        }
    }
}

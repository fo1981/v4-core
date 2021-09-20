// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.6;

import "./libraries/DrawLib.sol";
import "./libraries/DrawRingBuffer.sol";

import "@pooltogether/owner-manager-contracts/contracts/OwnerOrManager.sol";

///@title TsunamiDrawSettingsHistory
contract TsunamiDrawSettingsHistory is OwnerOrManager {
  using DrawRingBuffer for DrawRingBuffer.Buffer;

  uint256 constant MAX_CARDINALITY = 256;

  event Deployed(uint8 cardinality);

  ///@notice Emitted when the DrawParams are set/updated
  event DrawSettingsSet(uint32 indexed drawId, DrawLib.TsunamiDrawSettings drawSettings);

  /// @notice The stored history of draw settings.  Stored as ring buffer.
  DrawLib.TsunamiDrawSettings[MAX_CARDINALITY] drawSettings;

  /// @notice Ring buffer data
  DrawRingBuffer.Buffer internal drawSettingsRingBuffer;

  /* ============ Constructor ============ */

  ///@notice Constructor for TsunamiDrawSettingsHistory
  constructor(uint8 _cardinality) {
    drawSettingsRingBuffer.cardinality = _cardinality;

    emit Deployed(_cardinality);
  }

  ///@notice Sets TsunamiDrawSettingsHistorySettings for a draw id. only callable by the owner or manager
  ///@param _drawId The id of the Draw
  ///@param _drawSettings The TsunamiDrawSettingsHistorySettings to set
  function pushDrawSettings(uint32 _drawId, DrawLib.TsunamiDrawSettings calldata _drawSettings) external onlyManagerOrOwner
    returns (bool success)
  {
    return _pushDrawSettings(_drawId, _drawSettings);
  }

  ///@notice Gets the TsunamiDrawSettingsHistorySettings for a draw id
  ///@param _drawId The id of the Draw
  function getDrawSetting(uint32 _drawId) external view returns(DrawLib.TsunamiDrawSettings memory)
  {
    return _getDrawSettings(drawSettingsRingBuffer, _drawId);
  }

  ///@notice Gets the TsunamiDrawSettingsHistorySettings for a draw id
  ///@param _drawIds The draw ids to get the settings for
  function getDrawSettings(uint32[] calldata _drawIds) external view returns(DrawLib.TsunamiDrawSettings[] memory)
  {
    DrawRingBuffer.Buffer memory buffer = drawSettingsRingBuffer;
    DrawLib.TsunamiDrawSettings[] memory _drawSettings = new DrawLib.TsunamiDrawSettings[](_drawIds.length);
    for (uint256 i = 0; i < _drawIds.length; i++) {
      _drawSettings[i] = _getDrawSettings(buffer, _drawIds[i]);
    }
    return _drawSettings;
  }

  /**
    * @notice Read newest Draw from the draws ring buffer.
    * @dev    Uses the nextDrawIndex to calculate the most recently added Draw.
    * @return DrawLib.TsunamiDrawSettings
  */
  function getNewestDrawSettings() external view returns (DrawLib.TsunamiDrawSettings memory) {
    DrawRingBuffer.Buffer memory buffer = drawSettingsRingBuffer;
    return drawSettings[buffer.getIndex(buffer.lastDrawId)];
  }

  /**
    * @notice Read oldest Draw from the draws ring buffer.
    * @dev    Finds the oldest Draw by comparing and/or diffing totalDraws with the cardinality.
    * @return DrawLib.TsunamiDrawSettings
  */
  function getOldestDrawSettings() external view returns (DrawLib.TsunamiDrawSettings memory) {
    // oldest draw should be next available index, otherwise it's at 0
    DrawRingBuffer.Buffer memory buffer = drawSettingsRingBuffer;
    DrawLib.TsunamiDrawSettings memory drawSet = drawSettings[buffer.nextIndex];
    if (drawSet.matchCardinality == 0) { // if draw is not init, then use draw at 0
      drawSet = drawSettings[0];
    }
    return drawSet;
  }

  /**
    * @notice Set existing Draw in draws ring buffer with new parameters.
    * @dev    Updating a Draw should be used sparingly and only in the event an incorrect Draw parameter has been stored.
    * @return Draw.drawId
  */
  function setDrawSetting(uint32 _drawId, DrawLib.TsunamiDrawSettings calldata _drawSettings) external onlyOwner returns (uint32) {
    DrawRingBuffer.Buffer memory buffer = drawSettingsRingBuffer;
    uint32 index = buffer.getIndex(_drawId);
    drawSettings[index] = _drawSettings;
    emit DrawSettingsSet(_drawId, _drawSettings);
    return _drawId;
  }

  ///@notice Set the DrawCalculators TsunamiDrawSettingsHistorySettings
  ///@dev Distributions must be expressed with Ether decimals (1e18)
  ///@param _drawId The id of the Draw
  ///@param _drawSettings TsunamiDrawSettingsHistorySettings struct to set
  function _pushDrawSettings(uint32 _drawId, DrawLib.TsunamiDrawSettings calldata _drawSettings) internal
    returns (bool)
  {
    uint256 distributionsLength = _drawSettings.distributions.length;

    require(_drawSettings.matchCardinality >= distributionsLength, "DrawCalc/matchCardinality-gte-distributions");
    require(_drawSettings.bitRangeSize <= 256 / _drawSettings.matchCardinality, "DrawCalc/bitRangeSize-too-large");
    require(_drawSettings.bitRangeSize > 0, "DrawCalc/bitRangeSize-gt-0");
    require(_drawSettings.numberOfPicks > 0, "DrawCalc/numberOfPicks-gt-0");
    require(_drawSettings.maxPicksPerUser > 0, "DrawCalc/maxPicksPerUser-gt-0");

    // ensure that the distributions are not gt 100%
    uint256 sumTotalDistributions = 0;
    for(uint256 index = 0; index < distributionsLength; index++){
      sumTotalDistributions += _drawSettings.distributions[index];
    }

    require(sumTotalDistributions <= 1e9, "DrawCalc/distributions-gt-100%");

    DrawRingBuffer.Buffer memory _drawSettingsRingBuffer = drawSettingsRingBuffer;
    drawSettings[_drawSettingsRingBuffer.nextIndex] = _drawSettings;
    drawSettingsRingBuffer = drawSettingsRingBuffer.push(_drawId);

    emit DrawSettingsSet(_drawId, _drawSettings);
    return true;
  }

  function _getDrawSettings(
    DrawRingBuffer.Buffer memory _drawSettingsRingBuffer,
    uint32 drawId
  ) internal view returns (DrawLib.TsunamiDrawSettings memory) {
    return drawSettings[_drawSettingsRingBuffer.getIndex(drawId)];
  }
}
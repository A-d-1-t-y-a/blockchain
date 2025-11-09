// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ThresholdManagerContract
 * @dev Manages dynamic threshold and participant configuration for FROST signatures
 * Supports adding/removing participants and adjusting threshold without service interruption
 */
contract ThresholdManagerContract is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant THRESHOLD_ROLE = keccak256("THRESHOLD_ROLE");

    // Gas-optimized storage packing
    struct Participant {
        address participantAddress; // 20 bytes
        uint64 addedAt;              // 8 bytes
        uint32 index;                // 4 bytes
        bool isActive;               // 1 byte
        // Total: 33 bytes (fits in 2 storage slots)
    }

    struct ThresholdConfig {
        uint128 threshold;      // Minimum signatures required
        uint128 totalParticipants; // Total active participants
        uint64 lastUpdated;     // Timestamp of last update
        bool isLocked;          // Emergency lock flag
    }

    // Storage variables
    ThresholdConfig public config;
    mapping(address => Participant) public participants;
    address[] public participantList; // For iteration
    mapping(address => bool) public pendingRemovals;
    mapping(address => bool) public pendingAdditions;

    // Events
    event ParticipantAdded(address indexed participant, uint256 newTotal);
    event ParticipantRemoved(address indexed participant, uint256 newTotal);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event KeyRefreshInitiated(uint256 timestamp);
    event EmergencyLock(bool locked);

    // Modifiers
    modifier validThreshold(uint256 newThreshold) {
        require(newThreshold > 0, "ThresholdManager: threshold must be > 0");
        require(
            newThreshold <= participantList.length,
            "ThresholdManager: threshold exceeds participants"
        );
        require(
            newThreshold >= (participantList.length + 1) / 2,
            "ThresholdManager: threshold must be majority"
        );
        _;
    }

    modifier notLocked() {
        require(!config.isLocked, "ThresholdManager: contract is locked");
        _;
    }

    constructor(uint128 initialThreshold, address[] memory initialParticipants) {
        require(initialParticipants.length >= initialThreshold, "ThresholdManager: insufficient participants");
        require(
            initialThreshold >= (initialParticipants.length + 1) / 2,
            "ThresholdManager: threshold must be majority"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(THRESHOLD_ROLE, msg.sender);

        config = ThresholdConfig({
            threshold: initialThreshold,
            totalParticipants: uint128(initialParticipants.length),
            lastUpdated: uint64(block.timestamp),
            isLocked: false
        });

        // Add initial participants
        for (uint256 i = 0; i < initialParticipants.length; i++) {
            _addParticipantInternal(initialParticipants[i], uint32(i));
        }
    }

    /**
     * @dev Add a new participant (requires threshold signatures)
     * @param newParticipant Address of new participant
     */
    function addParticipant(address newParticipant)
        external
        onlyRole(THRESHOLD_ROLE)
        nonReentrant
        notLocked
    {
        require(newParticipant != address(0), "ThresholdManager: zero address");
        require(
            !participants[newParticipant].isActive,
            "ThresholdManager: participant already active"
        );
        require(
            !pendingAdditions[newParticipant],
            "ThresholdManager: addition already pending"
        );

        pendingAdditions[newParticipant] = true;
        
        uint32 index = uint32(participantList.length);
        _addParticipantInternal(newParticipant, index);
        
        config.totalParticipants = uint128(participantList.length);
        config.lastUpdated = uint64(block.timestamp);

        pendingAdditions[newParticipant] = false;

        emit ParticipantAdded(newParticipant, participantList.length);
        emit KeyRefreshInitiated(block.timestamp);
    }

    /**
     * @dev Remove a participant (requires threshold signatures)
     * @param participant Address of participant to remove
     */
    function removeParticipant(address participant)
        external
        onlyRole(THRESHOLD_ROLE)
        nonReentrant
        notLocked
    {
        require(participants[participant].isActive, "ThresholdManager: participant not active");
        require(
            participantList.length - 1 >= config.threshold,
            "ThresholdManager: removal would violate threshold"
        );
        require(
            !pendingRemovals[participant],
            "ThresholdManager: removal already pending"
        );

        pendingRemovals[participant] = true;
        
        uint32 index = participants[participant].index;
        address lastParticipant = participantList[participantList.length - 1];
        
        // Swap with last element and remove
        participantList[index] = lastParticipant;
        participants[lastParticipant].index = index;
        participantList.pop();
        
        delete participants[participant];
        
        config.totalParticipants = uint128(participantList.length);
        config.lastUpdated = uint64(block.timestamp);

        pendingRemovals[participant] = false;

        emit ParticipantRemoved(participant, participantList.length);
        emit KeyRefreshInitiated(block.timestamp);
    }

    /**
     * @dev Update threshold (requires admin role)
     * @param newThreshold New threshold value
     */
    function updateThreshold(uint128 newThreshold)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
        notLocked
        validThreshold(newThreshold)
    {
        uint128 oldThreshold = config.threshold;
        config.threshold = newThreshold;
        config.lastUpdated = uint64(block.timestamp);

        emit ThresholdUpdated(oldThreshold, newThreshold);
        emit KeyRefreshInitiated(block.timestamp);
    }

    /**
     * @dev Emergency lock (circuit breaker)
     */
    function emergencyLock() external onlyRole(ADMIN_ROLE) {
        config.isLocked = true;
        emit EmergencyLock(true);
    }

    /**
     * @dev Unlock after emergency
     */
    function unlock() external onlyRole(ADMIN_ROLE) {
        config.isLocked = false;
        emit EmergencyLock(false);
    }

    /**
     * @dev Get all active participants
     * @return addresses Array of participant addresses
     */
    function getActiveParticipants() external view returns (address[] memory addresses) {
        return participantList;
    }

    /**
     * @dev Check if address is active participant
     * @param participant Address to check
     * @return isActive True if participant is active
     */
    function isActiveParticipant(address participant) external view returns (bool isActive) {
        return participants[participant].isActive;
    }

    /**
     * @dev Get current threshold configuration
     * @return threshold Current threshold
     * @return totalParticipants Total active participants
     */
    function getThresholdConfig()
        external
        view
        returns (uint128 threshold, uint128 totalParticipants)
    {
        return (config.threshold, config.totalParticipants);
    }

    /**
     * @dev Internal function to add participant
     */
    function _addParticipantInternal(address participant, uint32 index) internal {
        participants[participant] = Participant({
            participantAddress: participant,
            addedAt: uint64(block.timestamp),
            index: index,
            isActive: true
        });
        
        participantList.push(participant);
    }
}


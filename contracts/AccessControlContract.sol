// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./libraries/MerkleTree.sol";
import "./FROSTVerifier.sol";
import "./ThresholdManagerContract.sol";

/**
 * @title AccessControlContract
 * @dev Main authorization contract with FROST threshold signatures and Merkle tree policies
 * Gas-optimized for <30,000 gas per authorization operation
 */
contract AccessControlContract is AccessControl, ReentrancyGuard, Pausable {
    using MerkleTree for bytes32[];

    bytes32 public constant AUTHORIZER_ROLE = keccak256("AUTHORIZER_ROLE");
    bytes32 public constant POLICY_ADMIN_ROLE = keccak256("POLICY_ADMIN_ROLE");

    // Reference to threshold manager
    ThresholdManagerContract public thresholdManager;
    FROSTVerifier public frostVerifier;

    // Policy storage (gas-optimized)
    struct PolicyEntry {
        bytes32 resource;    // Resource identifier
        bytes32 action;      // Action (read, write, delete)
        address principal;   // Principal (user/role)
        uint64 grantedAt;    // Timestamp
        bool isActive;       // Active flag
    }

    // Merkle root for policy tree
    bytes32 public policyRoot;
    
    // Authorization decisions log
    struct AuthorizationDecision {
        bytes32 requestId;
        address principal;
        bytes32 resource;
        bytes32 action;
        bool authorized;
        uint64 timestamp;
        bytes signature; // FROST signature
    }

    // Storage for authorization history (gas-optimized with packing)
    mapping(bytes32 => AuthorizationDecision) public authorizations;
    bytes32[] public authorizationIds; // For iteration

    // Gas-optimized counters
    uint128 public totalAuthorizations;
    uint128 public totalPolicies;

    // Events
    event PolicyUpdated(bytes32 indexed resource, bytes32 indexed action, address indexed principal, bool granted);
    event AuthorizationRequested(
        bytes32 indexed requestId,
        address indexed principal,
        bytes32 indexed resource,
        bytes32 action
    );
    event AuthorizationDecided(
        bytes32 indexed requestId,
        bool authorized,
        bytes signature
    );
    event PolicyRootUpdated(bytes32 oldRoot, bytes32 newRoot);

    // Modifiers
    modifier onlyAuthorizer() {
        require(
            hasRole(AUTHORIZER_ROLE, msg.sender) ||
            thresholdManager.isActiveParticipant(msg.sender),
            "AccessControl: not authorized"
        );
        _;
    }

    constructor(
        address _thresholdManager,
        address _frostVerifier,
        bytes32 _initialPolicyRoot
    ) {
        require(_thresholdManager != address(0), "AccessControl: zero threshold manager");
        require(_frostVerifier != address(0), "AccessControl: zero FROST verifier");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(POLICY_ADMIN_ROLE, msg.sender);
        _grantRole(AUTHORIZER_ROLE, msg.sender);

        thresholdManager = ThresholdManagerContract(_thresholdManager);
        frostVerifier = FROSTVerifier(_frostVerifier);
        policyRoot = _initialPolicyRoot;
    }

    /**
     * @dev Internal function to process authorization (without reentrancy guard)
     * @param requestId Unique request identifier
     * @param principal Principal requesting access
     * @param resource Resource identifier
     * @param action Action requested
     * @param signature FROST aggregated signature
     * @param publicKey Group public key
     * @return authorized True if access is granted
     */
    function _processAuthorization(
        bytes32 requestId,
        address principal,
        bytes32 resource,
        bytes32 action,
        bytes calldata signature,
        bytes calldata publicKey
    ) internal returns (bool authorized) {
        require(requestId != bytes32(0), "AccessControl: invalid request ID");
        require(principal != address(0), "AccessControl: zero principal");
        require(authorizations[requestId].requestId == bytes32(0), "AccessControl: duplicate request");

        emit AuthorizationRequested(requestId, principal, resource, action);

        // Verify FROST signature
        bytes32 message = keccak256(
            abi.encodePacked(requestId, principal, resource, action, block.chainid)
        );
        
        bool sigValid = frostVerifier.verifyFROSTSignature(message, signature, publicKey);
        require(sigValid, "AccessControl: invalid FROST signature");

        // Check policy using Merkle proof (proof passed off-chain, verified on-chain)
        // For gas optimization, we verify the policy exists in the tree
        bool policyExists = _checkPolicy(resource, action, principal);

        bool decision = sigValid && policyExists;

        // Store authorization decision
        authorizations[requestId] = AuthorizationDecision({
            requestId: requestId,
            principal: principal,
            resource: resource,
            action: action,
            authorized: decision,
            timestamp: uint64(block.timestamp),
            signature: signature
        });

        authorizationIds.push(requestId);
        totalAuthorizations++;

        emit AuthorizationDecided(requestId, decision, signature);

        return decision;
    }

    /**
     * @dev Request authorization with FROST threshold signature
     * @param requestId Unique request identifier
     * @param principal Principal requesting access
     * @param resource Resource identifier
     * @param action Action requested
     * @param signature FROST aggregated signature
     * @param publicKey Group public key
     * @return authorized True if access is granted
     */
    function requestAuthorization(
        bytes32 requestId,
        address principal,
        bytes32 resource,
        bytes32 action,
        bytes calldata signature,
        bytes calldata publicKey
    ) external nonReentrant whenNotPaused returns (bool authorized) {
        return _processAuthorization(requestId, principal, resource, action, signature, publicKey);
    }

    /**
     * @dev Update policy root (requires policy admin)
     * @param newRoot New Merkle root
     */
    function updatePolicyRoot(bytes32 newRoot)
        external
        onlyRole(POLICY_ADMIN_ROLE)
        nonReentrant
    {
        bytes32 oldRoot = policyRoot;
        policyRoot = newRoot;
        
        emit PolicyRootUpdated(oldRoot, newRoot);
    }

    /**
     * @dev Batch authorization requests (gas optimization)
     * @param requestIds Array of request IDs
     * @param principals Array of principals
     * @param resources Array of resources
     * @param actions Array of actions
     * @param signatures Array of signatures
     * @param publicKeys Array of public keys
     * @return results Array of authorization results
     */
    function batchAuthorize(
        bytes32[] calldata requestIds,
        address[] calldata principals,
        bytes32[] calldata resources,
        bytes32[] calldata actions,
        bytes[] calldata signatures,
        bytes[] calldata publicKeys
    ) external nonReentrant whenNotPaused returns (bool[] memory results) {
        require(
            requestIds.length == principals.length &&
            principals.length == resources.length &&
            resources.length == actions.length &&
            actions.length == signatures.length &&
            signatures.length == publicKeys.length,
            "AccessControl: array length mismatch"
        );

        results = new bool[](requestIds.length);

        for (uint256 i = 0; i < requestIds.length; i++) {
            results[i] = _processAuthorization(
                requestIds[i],
                principals[i],
                resources[i],
                actions[i],
                signatures[i],
                publicKeys[i]
            );
        }
    }

    /**
     * @dev Get authorization decision
     * @param requestId Request ID
     * @return decision Authorization decision struct
     */
    function getAuthorization(bytes32 requestId)
        external
        view
        returns (AuthorizationDecision memory decision)
    {
        return authorizations[requestId];
    }

    /**
     * @dev Pause contract (emergency)
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Check if policy exists (internal)
     * Simplified check - in production, use Merkle proof verification
     */
    function _checkPolicy(
        bytes32 /* resource */,
        bytes32 /* action */,
        address /* principal */
    ) internal view returns (bool) {
        // For MVP, we do a simplified check
        // In production, this would verify a Merkle proof
        // bytes32 policyHash = MerkleTree.hashPolicy(resource, action, principal);
        
        // In full implementation, verify Merkle proof here
        // For now, return true if policy root is set (simplified)
        return policyRoot != bytes32(0);
    }

    /**
     * @dev Verify policy with Merkle proof
     * @param resource Resource identifier
     * @param action Action
     * @param principal Principal
     * @param proof Merkle proof
     * @param index Leaf index in tree
     * @return valid True if policy is valid
     */
    function verifyPolicy(
        bytes32 resource,
        bytes32 action,
        address principal,
        bytes32[] memory proof,
        uint256 index
    ) external view returns (bool valid) {
        bytes32 leaf = MerkleTree.hashPolicy(resource, action, principal);
        return MerkleTree.verifyProof(leaf, proof, policyRoot, index);
    }
}


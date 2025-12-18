// Gesture Detection Module for I-L-O-V-E-U

// Landmark indices for reference
const FINGER_TIPS = {
    THUMB: 4,
    INDEX: 8,
    MIDDLE: 12,
    RING: 16,
    PINKY: 20
};

const FINGER_MCP = {
    THUMB: 2,
    INDEX: 5,
    MIDDLE: 9,
    RING: 13,
    PINKY: 17
};

const FINGER_PIP = {
    INDEX: 6,
    MIDDLE: 10,
    RING: 14,
    PINKY: 18
};

/**
 * Check if a finger is extended (tip is higher than PIP joint)
 * For thumb, we check horizontal distance instead
 */
function isFingerExtended(landmarks, finger) {
    if (finger === 'THUMB') {
        // Thumb: check if tip is far from index MCP horizontally
        const thumbTip = landmarks[FINGER_TIPS.THUMB];
        const thumbMcp = landmarks[FINGER_MCP.THUMB];
        const indexMcp = landmarks[FINGER_MCP.INDEX];
        // Thumb extended if tip is further from palm than base
        return Math.abs(thumbTip.x - indexMcp.x) > Math.abs(thumbMcp.x - indexMcp.x);
    }
    
    const tip = landmarks[FINGER_TIPS[finger]];
    const pip = landmarks[FINGER_PIP[finger]];
    const mcp = landmarks[FINGER_MCP[finger]];
    
    // Finger is extended if tip is higher (lower y) than PIP
    return tip.y < pip.y && tip.y < mcp.y;
}

/**
 * Check if a finger is curled (tip is lower than MCP joint)
 */
function isFingerCurled(landmarks, finger) {
    if (finger === 'THUMB') {
        const thumbTip = landmarks[FINGER_TIPS.THUMB];
        const thumbMcp = landmarks[FINGER_MCP.THUMB];
        const indexMcp = landmarks[FINGER_MCP.INDEX];
        return Math.abs(thumbTip.x - indexMcp.x) < Math.abs(thumbMcp.x - indexMcp.x) * 1.2;
    }
    
    const tip = landmarks[FINGER_TIPS[finger]];
    const pip = landmarks[FINGER_PIP[finger]];
    
    // Finger is curled if tip is lower (higher y) than PIP
    return tip.y > pip.y;
}

/**
 * Calculate distance between two landmarks
 */
function distance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) + 
        Math.pow(p1.y - p2.y, 2) + 
        Math.pow((p1.z || 0) - (p2.z || 0), 2)
    );
}

/**
 * Main gesture checking function
 * @param {Array} landmarks - Hand landmarks from MediaPipe
 * @param {string} targetChar - Target character ('I', 'L', 'O', 'V', 'E', 'U')
 * @returns {boolean} - True if gesture matches target
 */
export function checkGesture(landmarks, targetChar) {
    if (!landmarks || landmarks.length < 21) return false;
    
    const indexExtended = isFingerExtended(landmarks, 'INDEX');
    const middleExtended = isFingerExtended(landmarks, 'MIDDLE');
    const ringExtended = isFingerExtended(landmarks, 'RING');
    const pinkyExtended = isFingerExtended(landmarks, 'PINKY');
    const thumbExtended = isFingerExtended(landmarks, 'THUMB');
    
    const indexCurled = isFingerCurled(landmarks, 'INDEX');
    const middleCurled = isFingerCurled(landmarks, 'MIDDLE');
    const ringCurled = isFingerCurled(landmarks, 'RING');
    const pinkyCurled = isFingerCurled(landmarks, 'PINKY');
    
    switch (targetChar.toUpperCase()) {
        case 'I':
            // Index extended, others curled
            return indexExtended && middleCurled && ringCurled && pinkyCurled && !thumbExtended;
        
        case 'L':
            // Thumb and Index extended, others curled
            return thumbExtended && indexExtended && middleCurled && ringCurled && pinkyCurled;
        
        case 'O':
            // Thumb tip and Index tip touching (circle shape)
            const thumbTip = landmarks[FINGER_TIPS.THUMB];
            const indexTip = landmarks[FINGER_TIPS.INDEX];
            const dist = distance(thumbTip, indexTip);
            return dist < 0.08; // Threshold for "touching"
        
        case 'V':
            // Index and Middle extended (peace sign), others curled
            return indexExtended && middleExtended && ringCurled && pinkyCurled;
        
        case 'E':
            // All fingers curled (fist) - "holding tight"
            return indexCurled && middleCurled && ringCurled && pinkyCurled && !thumbExtended;
        
        case 'U':
            // Index and Pinky extended (rock/metal sign 🤘), others curled
            return indexExtended && middleCurled && ringCurled && pinkyExtended;
        
        default:
            return false;
    }
}

/**
 * Get the gesture sequence
 */
export const GESTURE_SEQUENCE = ['I', 'L', 'O', 'V', 'E', 'U'];

/**
 * Get display name for each gesture
 */
export function getGestureHint(char) {
    const hints = {
        'I': '☝️ Point with your index finger',
        'L': '👍 Make an L shape (thumb + index)',
        'O': '👌 Make an O with thumb and index',
        'V': '✌️ Peace sign (index + middle)',
        'E': '✊ Make a fist (hold tight)',
        'U': '🤘 Rock sign (index + pinky)'
    };
    return hints[char] || '';
}




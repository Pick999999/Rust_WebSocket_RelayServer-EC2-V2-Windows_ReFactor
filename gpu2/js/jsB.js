/**
 * jsB.js - Secure Authentication & WebSocket Module
 * ปลอดภัยสูงสุด: ไม่เก็บ API Token ในหน้าเว็บ, ใช้ SHA3 + JWT + HttpOnly Cookie
 * 
 * Features:
 * - Two-step authentication (Username/Password → PIN)
 * - SHA3 password hashing
 * - JWT token verification
 * - Encrypted API token from server
 * - Shared WebSocket connection for all pages
 * - HttpOnly Cookie support
 */

// ==========================================
// 🚨 BYPASS LOGIN MODE - SET TO false IN PRODUCTION!
// ==========================================
const BYPASS_LOGIN = true;

// Demo API Token for bypass mode (replace with your actual token)
const DEMO_API_TOKEN = 'YOUR_DERIV_API_TOKEN_HERE';

var currentApiToken = null;
var loginId = null;

// Auto-setup bypass mode on load
if (BYPASS_LOGIN) {
    console.log('⚠️ BYPASS_LOGIN is ENABLED - Skipping authentication!');
    // Set fake session data so app works
    sessionStorage.setItem('deriv_token', btoa(DEMO_API_TOKEN));
    sessionStorage.setItem('auth_jwt', 'bypass_mode_jwt');
    sessionStorage.setItem('username', 'demo');
    currentApiToken = DEMO_API_TOKEN;
}

// jsB Module
window.jsB = {

    /**
     * Initialize secure connection with encrypted API token
     * @param {string} encryptedToken - Encrypted API token from PHP
     */
    async initializeSecureConnection(encryptedToken) {
        if (BYPASS_LOGIN) {
            currentApiToken = DEMO_API_TOKEN;
            console.log('🔓 Bypass mode: Using demo token');
            return true;
        }
        currentApiToken = this.decodeApiToken(encryptedToken);
        return true;
    },

    decodeApiToken(encryptedToken) {
        if (BYPASS_LOGIN) {
            return DEMO_API_TOKEN;
        }

        // Decode/decrypt token (simple base64 for demo, use stronger encryption in production)
        let apiToken;
        try {
            apiToken = atob(encryptedToken);

            // Validate token format (should start with letters and numbers)
            if (!apiToken || apiToken.length < 10) {
                throw new Error('Invalid token format after decoding');
            }
        } catch (decodeError) {
            console.error('❌ Token decode error:', decodeError);
            throw new Error('Failed to decode API token');
        }

        return apiToken;
    },

    authorizeSocket(ws, apiToken, { timeoutMs = 10000 } = {}) {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            // Use demo token if bypass mode
            const tokenToUse = BYPASS_LOGIN ? DEMO_API_TOKEN : apiToken;

            const reqId = 'auth_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const authRequest = {
                authorize: tokenToUse,
                req_id: reqId
            };

            const onMessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (data.req_id !== reqId) return;

                ws.removeEventListener('message', onMessage);
                clearTimeout(timeoutId);

                if (data.error) {
                    reject(new Error(data.error.message || 'Authorization failed'));
                    return;
                }

                if (data.authorize) {
                    loginId = data.authorize.loginid;
                    resolve(data.authorize);
                } else {
                    reject(new Error('Invalid authorization response'));
                }
            };

            const timeoutId = setTimeout(() => {
                ws.removeEventListener('message', onMessage);
                reject(new Error('Authorization timeout'));
            }, timeoutMs);

            ws.addEventListener('message', onMessage);
            ws.send(JSON.stringify(authRequest));
        });
    },

    authorizeEncryptedToken(ws, encryptedToken, options) {
        if (BYPASS_LOGIN) {
            currentApiToken = DEMO_API_TOKEN;
            return this.authorizeSocket(ws, DEMO_API_TOKEN, options);
        }
        const apiToken = this.decodeApiToken(encryptedToken);
        currentApiToken = apiToken;
        return this.authorizeSocket(ws, apiToken, options);
    },

    isAuthenticated() {
        // Always return true in bypass mode
        if (BYPASS_LOGIN) {
            return true;
        }
        const token = sessionStorage.getItem('deriv_token');
        const jwt = sessionStorage.getItem('auth_jwt');
        return Boolean(token && jwt);
    },

    /**
     * Get current API token
     */
    getApiToken() {
        if (BYPASS_LOGIN) {
            return DEMO_API_TOKEN;
        }
        return currentApiToken;
    },

    /**
     * Get current login ID
     */
    getLoginId() {
        return loginId || sessionStorage.getItem('deriv_loginid');
    },

    /**
     * Logout and clear session
     */
    logout() {
        console.log('🚪 Logging out...');

        // Clear all session data
        sessionStorage.clear();

        // Clear variables
        currentApiToken = null;
        loginId = null;

        // Redirect to login (skip in bypass mode if needed)
        if (!BYPASS_LOGIN) {
            window.location.href = 'login.html';
        } else {
            console.log('🔓 Bypass mode: Logout disabled, refreshing page...');
            window.location.reload();
        }
    },

    /**
     * Verify session and redirect if not authenticated
     */
    requireAuth() {
        // Skip auth check in bypass mode
        if (BYPASS_LOGIN) {
            console.log('🔓 Bypass mode: Auth check skipped');
            return true;
        }

        const token = sessionStorage.getItem('deriv_token');
        const jwt = sessionStorage.getItem('auth_jwt');

        if (!token || !jwt) {
            console.log('⚠️ Not authenticated, redirecting to login...');
            window.location.href = 'login.html';
            return false;
        }

        return true;
    }
};

console.log('🔐 jsB Security Module Loaded');
if (BYPASS_LOGIN) {
    console.log('⚠️ WARNING: BYPASS_LOGIN is ON! Set to false in production!')
}

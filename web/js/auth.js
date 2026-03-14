const Auth = (() => {
    const TOKEN_KEY = 'matcha_token';
    const USER_KEY = 'matcha_user';

    function save(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clear() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
    }

    function isLoggedIn() {
        return !!localStorage.getItem(TOKEN_KEY);
    }

    return { save, clear, getUser, isLoggedIn };
})();

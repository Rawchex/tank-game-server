const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'users.json');

class Database {
    constructor() {
        this.users = {};
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(DB_FILE)) {
                const data = fs.readFileSync(DB_FILE, 'utf8');
                this.users = JSON.parse(data);
            } else {
                this.save();
            }
        } catch (e) {
            console.error('Failed to load DB', e);
        }
    }

    save() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.users, null, 2));
        } catch (e) {
            console.error('Failed to save DB', e);
        }
    }

    register(username, password) {
        if (!username || username.length < 3) return { success: false, msg: "Kullanıcı adı çok kısa!" };
        if (!password || password.length < 4) return { success: false, msg: "Şifre çok kısa!" };
        if (this.users[username]) return { success: false, msg: "Bu kullanıcı adı daha önce alınmış!" };
        
        this.users[username] = {
            password: password,
            xp: 0,
            level: 1,
            layouts: [null, null, null, null, null] // 5 slots max
        };
        this.save();
        return { success: true, user: this.getUserData(username) };
    }

    login(username, password) {
        if (!this.users[username]) return { success: false, msg: "Kullanıcı bulunamadı!" };
        if (this.users[username].password !== password) return { success: false, msg: "Hatalı şifre!" };
        return { success: true, user: this.getUserData(username) };
    }

    getUserData(username) {
        if (!this.users[username]) return null;
        let u = this.users[username];
        return {
            name: username,
            xp: u.xp,
            level: u.level,
            layouts: u.layouts
        };
    }

    saveLayout(username, slotIndex, layoutData) {
        if (!this.users[username]) return false;
        if (slotIndex < 0 || slotIndex >= 5) return false;
        this.users[username].layouts[slotIndex] = layoutData;
        this.save();
        return true;
    }
}

module.exports = new Database();

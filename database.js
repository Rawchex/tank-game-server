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
            layouts: [] // Unlimited named layouts
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

    saveLayout(username, name, layoutData) {
        if (!this.users[username]) return false;
        const layouts = this.users[username].layouts || [];
        
        // Update if exists, else push
        const existing = layouts.findIndex(l => l.name === name);
        if (existing !== -1) {
            layouts[existing].data = layoutData;
            layouts[existing].updatedAt = Date.now();
        } else {
            layouts.push({
                id: Math.random().toString(36).substr(2, 9),
                name: name,
                data: layoutData,
                createdAt: Date.now()
            });
        }
        this.users[username].layouts = layouts;
        this.save();
        return true;
    }

    deleteLayout(username, layoutId) {
        if (!this.users[username]) return false;
        this.users[username].layouts = this.users[username].layouts.filter(l => l.id !== layoutId);
        this.save();
        return true;
    }
}

module.exports = new Database();

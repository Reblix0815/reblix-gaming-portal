const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'products.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Sicherer Ordner-Check ohne Absturz
try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
} catch (e) {
    console.log("Uploads Ordner Hinweis:", e.message);
}

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(session({
    secret: 'reblix_ldplayer_secret_key_98765',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Statische Dateien bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

function getData() {
    const defaultData = {
        categories: [
            {
                id: "ldplayer",
                name: "LDPLAYER",
                subtitle: "Spiele deine Lieblings-Handyspiele flüssig am PC",
                link: "https://leap.ldplayer.gg/T4VV05TOl",
                refCode: "27914614",
                btnColor: "bg-brand text-slate-950"
            }
        ],
        products: []
    };
    if (!fs.existsSync(DATA_FILE)) return defaultData;
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            categories: parsed.categories || defaultData.categories,
            products: parsed.products || []
        };
    } catch (error) {
        return defaultData;
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        return false;
    }
}

function requireAuth(req, res, next) {
    if (req.session && req.session.isLoggedIn) {
        return next();
    }
    return res.status(401).json({ success: false, message: "Nicht autorisiert!" });
}

// API ROUTEN
app.get('/api/data', (req, res) => {
    res.json(getData());
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'Reblix' && password === 'M3h36mimik') {
        req.session.isLoggedIn = true;
        req.session.username = username;
        return res.json({ success: true, redirectUrl: '/admin.html' });
    } else {
        return res.status(401).json({ success: false, message: 'Falscher Benutzername oder Passwort!' });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login.html'));
});

app.get('/api/auth-status', (req, res) => {
    res.json({ loggedIn: !!(req.session && req.session.isLoggedIn), user: req.session ? req.session.username : null });
});

// Bild-Upload vom PC
app.post('/api/admin/upload', requireAuth, (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ success: false, message: "Kein Bild empfangen!" });

    try {
        const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) return res.status(400).json({ success: false, message: "Ungültiges Format!" });

        const ext = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const safeName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        
        fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
        res.json({ success: true, imageUrl: `/uploads/${safeName}` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Upload-Fehler!" });
    }
});

// Kategorien verwalten
app.post('/api/admin/categories', requireAuth, (req, res) => {
    const { id, name, subtitle, link, refCode, btnColor } = req.body;
    if (!name || !link) {
        return res.status(400).json({ success: false, message: "Name und Link sind erforderlich!" });
    }

    const currentData = getData();
    const catId = id ? id.trim() : name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existingIndex = currentData.categories.findIndex(c => c.id === catId);

    const categoryData = {
        id: catId,
        name: name.trim(),
        subtitle: (subtitle || '').trim(),
        link: link.trim(),
        refCode: (refCode || '').trim(),
        btnColor: btnColor || 'bg-brand text-slate-950'
    };

    if (existingIndex >= 0) {
        currentData.categories[existingIndex] = categoryData;
    } else {
        currentData.categories.push(categoryData);
    }

    if (saveData(currentData)) {
        res.json({ success: true, category: categoryData });
    } else {
        res.status(500).json({ success: false, message: "Fehler beim Speichern der Kategorie." });
    }
});

app.delete('/api/admin/categories/:id', requireAuth, (req, res) => {
    const catId = req.params.id;
    const currentData = getData();

    currentData.categories = currentData.categories.filter(c => c.id !== catId);
    currentData.products = currentData.products.filter(p => p.categoryId !== catId);

    if (saveData(currentData)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ success: false, message: "Fehler beim Löschen." });
    }
});

// Produkte verwalten
app.post('/api/admin/products', requireAuth, (req, res) => {
    const { categoryId, title, description, image, link } =

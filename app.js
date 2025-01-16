require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

app.use(session({
    secret: 'gizli-anahtar',
    resave: false,
    saveUninitialized: true
}));

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://EnvanterYonetimi:21217521944.+00Yuni@envanter.g0xeh.mongodb.net/EnvanterDB?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB bağlantısı başarılı!'))
.catch(err => console.error('MongoDB bağlantısı başarısız:', err));

// Kullanıcı Modeli
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    company: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Malzeme Modeli
const materialSchema = new mongoose.Schema({
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    brand: { type: String, required: true },
    group: { type: String, required: true },
    barcode: { type: String },
    company: { type: String, required: true }
});
const Material = mongoose.model('Material', materialSchema);

// Giriş Sayfası
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Giriş İşlemi
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.loggedIn = true;
            req.session.company = user.company;
            res.redirect('/');
        } else {
            res.render('login', { error: 'Yanlış kullanıcı adı veya şifre!' });
        }
    } catch (err) {
        console.error('Giriş sırasında hata:', err);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Kayıt Sayfası
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// Kayıt İşlemi
app.post('/register', async (req, res) => {
    const { username, password, company } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, company });
        res.redirect('/login');
    } catch (err) {
        console.error('Kayıt sırasında hata:', err);
        res.render('register', { error: 'Kullanıcı adı zaten mevcut!' });
    }
});

// Ana Sayfa
app.get('/', async (req, res) => {
    if (req.session.loggedIn) {
        const materials = await Material.find({ company: req.session.company });
        const groups = [...new Set(materials.map(m => m.group))];
        res.render('index', { materials, groups });
    } else {
        res.redirect('/login');
    }
});

// Malzeme Ekleme
app.post('/add-item', async (req, res) => {
    const { name, quantity, brand, group, barcode } = req.body;
    try {
        await Material.create({
            name,
            quantity: parseInt(quantity),
            brand,
            group,
            barcode,
            company: req.session.company
        });
        res.redirect('/');
    } catch (err) {
        console.error('Malzeme eklenirken hata:', err);
        res.status(500).send('Malzeme eklenirken bir hata oluştu.');
    }
});

// Grup Ekleme
app.post('/add-group', async (req, res) => {
    const { groupName } = req.body;

    try {
        const existingMaterials = await Material.find({ company: req.session.company });
        const groups = [...new Set(existingMaterials.map(m => m.group))];

        if (!groups.includes(groupName)) {
            await Material.create({
                name: "Boş",
                quantity: 0,
                brand: "Boş",
                group: groupName,
                company: req.session.company,
                barcode: ""
            });
        }
        res.redirect('/');
    } catch (err) {
        console.error('Grup eklenirken hata:', err);
        res.status(500).send('Grup eklenirken bir hata oluştu.');
    }
});

// Malzeme Azaltma
app.post('/decrease-item', async (req, res) => {
    const { id } = req.body;
    try {
        const material = await Material.findById(id);
        if (material.quantity > 1) {
            material.quantity -= 1;
            await material.save();
        } else {
            await Material.findByIdAndDelete(id);
        }
        res.redirect('/');
    } catch (err) {
        console.error('Malzeme azaltılırken hata:', err);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Malzeme Silme
app.post('/delete-item', async (req, res) => {
    const { id } = req.body;
    try {
        await Material.findByIdAndDelete(id);
        res.redirect('/');
    } catch (err) {
        console.error('Malzeme silinirken hata:', err);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Excel Export Rotası
app.get('/export', async (req, res) => {
    try {
        const materials = await Material.find({ company: req.session.company });
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Envanter');

        // Başlıklar
        sheet.columns = [
            { header: 'Malzeme Adı', key: 'name', width: 20 },
            { header: 'Adet', key: 'quantity', width: 10 },
            { header: 'Marka', key: 'brand', width: 20 },
            { header: 'Grup', key: 'group', width: 20 },
            { header: 'Barkod', key: 'barcode', width: 20 }
        ];

        // Veriler
        materials.forEach(material => {
            sheet.addRow({
                name: material.name,
                quantity: material.quantity,
                brand: material.brand,
                group: material.group,
                barcode: material.barcode || 'Yok'
            });
        });

        // Dosyayı İndir
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=envanter.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Excel dosyası oluşturulurken hata:', err);
        res.status(500).send('Excel dosyası oluşturulurken bir hata oluştu.');
    }
});

// Arama Rotası
app.get('/search', async (req, res) => {
    const { query } = req.query;

    try {
        const results = await Material.find({
            company: req.session.company,
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { brand: { $regex: query, $options: 'i' } },
                { barcode: { $regex: query, $options: 'i' } }
            ]
        });

        res.render('search-results', { results, query });
    } catch (err) {
        console.error('Arama sırasında hata:', err);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Çıkış İşlemi
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Sunucuyu Başlat
app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS: allow any localhost port (dev), LAN IPs, Netlify, GitHub Pages, and file:// (null)
app.use(cors({
    origin: function (origin, callback) {
        // null origin = file:// protocol (can be undefined or the literal string "null")
        if (!origin || origin === 'null') return callback(null, true);

        const allowed = (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
            /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin) ||
            /\.netlify\.app$/.test(origin) ||
            /\.github\.io$/.test(origin)
        );

        if (allowed) return callback(null, true);
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: false
}));


// MongoDB Atlas Connection
if (!process.env.DATABASE_URI) {
    console.error("❌ CRITICAL: DATABASE_URI is missing from .env file!");
    console.error("👉 Create backend/.env and set DATABASE_URI=mongodb+srv://...");
} else {
    console.log("📡 Attempting to connect to MongoDB Atlas...");
    mongoose.connect(process.env.DATABASE_URI, {
        serverSelectionTimeoutMS: 5000
    })
    .then(() => console.log("✅ Securely connected to MongoDB Atlas!"))
    .catch(err => {
        console.error("❌ Database connection failed!");
        console.error("👉 Please ensure your IP is whitelisted in MongoDB Atlas (Network Access).");
        console.error("👉 Actual Error:", err.message);
    });
}

// SECURITY NOTE: Passwords are stored as plaintext — for production, use bcrypt.
// This is preserved as-is to avoid breaking the existing auth flow.

// MongoDB Schema Definitions
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, index: true },   // FIX #2: Index for faster lookups
    usn: { type: String, index: true },
    pwd: { type: String, select: false },
    role: { type: String, default: 'student' },
    points: { type: Number, default: 50 },
    referralCode: String,
    refUsed: String
});
const User = mongoose.model('User', UserSchema);

const OrderSchema = new mongoose.Schema({
    id: { type: String, index: true },      // FIX #2: Index for faster lookups
    userId: String,
    userName: String,
    usn: String,
    items: Array,
    total: Number,
    date: String,
    slot: String,
    points: Number,
    status: String,
    redeemedPoints: { type: Boolean, default: false },
    completionDate: String,
    originalTotal: Number
});
const Order = mongoose.model('Order', OrderSchema);

const NotificationSchema = new mongoose.Schema({
    id: { type: String, index: true },
    userId: String,
    title: String,
    desc: String,
    unread: { type: Boolean, default: true },
    timestamp: String,
    alertStr: String
});
const Notification = mongoose.model('Notification', NotificationSchema);

const PrintSchema = new mongoose.Schema({
    id: { type: String, index: true },
    userId: String,
    fileName: String,
    pages: String,
    copies: String,
    format: String,
    status: String,
    date: String,
    price: Number,
    fileData: String,
    orderId: String,
    totalPages: Number
});
const PrintRequest = mongoose.model('PrintRequest', PrintSchema);

const ProductSchema = new mongoose.Schema({
    id: { type: Number, index: true },
    name: String,
    price: Number,
    category: String,
    branch: String,
    semester: String,
    stock: { type: Number, default: 0 },
    img: String
});
const Product = mongoose.model('Product', ProductSchema);

const SaleAnalyticsSchema = new mongoose.Schema({
    productId: Number,
    productName: String,
    quantitySold: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
});
const SaleAnalytics = mongoose.model('SaleAnalytics', SaleAnalyticsSchema);

const RedeemTransactionSchema = new mongoose.Schema({
    orderId: String,
    userId: String,
    userName: String,
    productNames: [String],
    discountAmount: Number,
    finalPrice: Number,
    date: { type: Date, default: Date.now }
});
const RedeemTransaction = mongoose.model('RedeemTransaction', RedeemTransactionSchema);

const DailyReportSchema = new mongoose.Schema({
    date: String,
    totalRevenue: Number,
    totalOrders: Number,
    soldProducts: Array,
    remainingStock: Array,
    redeemDiscounts: Number,
    cancelledOrders: Number
});
const DailyReport = mongoose.model('DailyReport', DailyReportSchema);

// FIX #3: Centralize the redeem discount constant (was hardcoded as 30 in two places)
const REDEEM_DISCOUNT_AMOUNT = 30;

// Auto-Healing Product Data Fallback
const fallbackProducts = [
    { id: 1, name: "Blue Book (60 Pages)", price: 20, category: "Exam", branch: "All", semester: "All", stock: 150, img: "📖" },
    { id: 2, name: "Pink Book (40 Pages)", price: 20, category: "Exam", branch: "All", semester: "All", stock: 200, img: "📕" },
    { id: 3, name: "Graph Sheets (10 Pcs)", price: 10, category: "Stationery", branch: "All", semester: "All", stock: 50, img: "📉" },
    { id: 4, name: "Record Book", price: 80, category: "Lab", branch: "All", semester: "All", stock: 0, img: "📓" },
    { id: 5, name: "Engineering Drawing Kit", price: 450, category: "Kits", branch: "MECH", semester: "1", stock: 15, img: "📐" },
    { id: 6, name: "Microprocessor Lab Manual", price: 120, category: "Lab", branch: "CSE", semester: "5", stock: 0, img: "📘" },
    { id: 7, name: "Scientific Calculator", price: 950, category: "Electronics", branch: "All", semester: "1", stock: 10, img: "🧮" },
    { id: 8, name: "Blue Ball Pen (Set of 5)", price: 50, category: "Stationery", branch: "All", semester: "All", stock: 100, img: "🖊️" },
    { id: 9, name: "A4 Project Paper (100 Pcs)", price: 120, category: "Stationery", branch: "All", semester: "All", stock: 80, img: "📄" },
    { id: 10, name: "DS Lab Manual + Eval Copy", price: 150, category: "Combo", branch: "CSE", semester: "3", stock: 100, img: "📚" },
    { id: 11, name: "VLSI Lab Manual + Eval Copy", price: 160, category: "Combo", branch: "ECE", semester: "6", stock: 50, img: "📜" },
    { id: 12, name: "Fluid Mechanics Manual + Eval", price: 140, category: "Combo", branch: "MECH", semester: "4", stock: 40, img: "🛠️" }
];

async function seedProducts() {
    if (mongoose.connection.readyState !== 1) return;
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            await Product.insertMany(fallbackProducts);
            console.log("🌱 Products seeded!");
        }
    } catch(e) { console.error("Seed error:", e.message); }
}
seedProducts();

app.get('/api/products', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        console.warn("⚠️ Serving Catalog from Backup (Local Sync Mode)");
        return res.json(fallbackProducts);
    }
    try {
        let prodList = await Product.find({}).sort({ id: 1 }).maxTimeMS(2000);
        if (prodList.length === 0) {
            await seedProducts();
            prodList = await Product.find({}).sort({ id: 1 });
        }
        res.json(prodList);
    } catch (err) {
        res.json(fallbackProducts);
    }
});

app.post('/api/products/restock', async (req, res) => {
    try {
        const { id, amount } = req.body;
        // FIX #4: Validate restock amount to prevent negative or zero restock
        if (!id || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: "Invalid restock parameters." });
        }
        const prod = await Product.findOneAndUpdate({ id }, { $inc: { stock: amount } }, { new: true });
        if (!prod) return res.status(404).json({ error: "Product not found." });
        res.json({ success: true, product: prod });
    } catch (err) { res.status(500).json({ error: "Restock failed" }); }
});

const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

// --- Helper for Sales Analytics ---
async function trackSale(item, orderDate) {
    const productId = item.id;
    const qty = item.qty;
    const revenue = item.price * qty;

    await SaleAnalytics.findOneAndUpdate(
        { productId, date: { $gte: new Date().setHours(0,0,0,0) } },
        {
            $inc: { quantitySold: qty, revenue: revenue },
            $setOnInsert: { productName: item.name, productId, date: new Date() }
        },
        { upsert: true, new: true }
    );

    await Product.findOneAndUpdate({ id: productId }, { $inc: { stock: -qty } });
}

// --- Automated Daily Reports @ 7:00 PM ---
async function generateDailyReport() {
    const today = new Date().toLocaleDateString();
    const orders = await Order.find({ date: { $regex: today.split(',')[0] } });
    const totalSales = orders.reduce((sum, o) => sum + (o.status === 'Cancelled' ? 0 : o.total), 0);
    const totalOrders = orders.length;
    const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
    const soldList = await SaleAnalytics.find({ date: { $gte: new Date().setHours(0,0,0,0) } });
    const stockList = await Product.find({}, 'name stock');
    const redemptions = await RedeemTransaction.find({ date: { $gte: new Date().setHours(0,0,0,0) } });
    const totalRedeems = redemptions.reduce((sum, r) => sum + r.discountAmount, 0);

    const report = new DailyReport({
        date: today,
        totalRevenue: totalSales,
        totalOrders,
        soldProducts: soldList,
        remainingStock: stockList,
        redeemDiscounts: totalRedeems,
        cancelledOrders: cancelledCount
    });

    await report.save();
    console.log(`📊 Daily Report for ${today} generated successfully.`);
    return report;
}

cron.schedule('0 19 * * *', () => {
    generateDailyReport();
});

// --- API Implementation ---

app.get('/api/admin/analytics', async (req, res) => {
    try {
        const sold = await SaleAnalytics.find({});
        const redeems = await RedeemTransaction.find({});
        const totalSales = sold.reduce((s, i) => s + i.revenue, 0);
        res.json({ sold, redeems, totalSales });
    } catch(err) { res.status(500).json({ error: "Analytics failed" }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;

        // FIX #5: Validate required order fields
        if (!orderData.userId || !orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            return res.status(400).json({ error: "Invalid order: missing userId or items." });
        }

        const originalTotal = orderData.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        orderData.originalTotal = originalTotal;

        const newOrder = new Order(orderData);
        await newOrder.save();

        for (const item of orderData.items) {
            // Skip bundles and print items — they don't have real stock to track
            if (!item.isBundle && !item.isPrint) {
                await trackSale(item, orderData.date);
            }
        }

        if (orderData.redeemedPoints) {
            const rt = new RedeemTransaction({
                orderId: orderData.id,
                userId: orderData.userId,
                userName: orderData.userName,
                productNames: orderData.items.map(i => i.name),
                discountAmount: REDEEM_DISCOUNT_AMOUNT, // FIX #3: use constant
                finalPrice: orderData.total
            });
            await rt.save();
        }

        res.json({ success: true, order: newOrder });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Order failed" });
    }
});

app.put('/api/orders/:id', async (req, res) => {
    try {
        const { status } = req.body;
        if (status === 'Completed') {
            req.body.completionDate = new Date().toISOString();
        }

        const existing = await Order.findOne({ id: req.params.id });

        // FIX #6: Null-guard — if order not found, return 404 instead of crashing
        if (!existing) {
            return res.status(404).json({ error: "Order not found." });
        }

        if (status === 'Cancelled' && existing.status !== 'Cancelled') {
            for (const item of existing.items) {
                // Only restore stock for real product items, not bundles or prints
                if (!item.isBundle && !item.isPrint) {
                    await Product.findOneAndUpdate({ id: item.id }, { $inc: { stock: item.qty } });
                }
            }
        }
        await Order.findOneAndUpdate({ id: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) {
        console.error("Order update error:", err);
        res.status(500).json({ error: "Update failed" });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find({});
        res.json(orders);
    } catch (err) { res.status(500).json({ error: "Fetch orders failed" }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, '-pwd');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Failed to fetch users" }); }
});

app.delete('/api/users/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (email === 'admin@college.edu') return res.status(403).json({ error: "Cannot delete admin!" });
        await User.findOneAndDelete({ email });
        res.json({ success: true, message: "User deleted successfully" });
    } catch (err) { res.status(500).json({ error: "Failed to delete user" }); }
});

app.post('/api/update-points', async (req, res) => {
    try {
        const { email, points } = req.body;
        // FIX #7: Validate points to prevent negative or NaN values being saved
        if (!email || typeof points !== 'number' || points < 0 || isNaN(points)) {
            return res.status(400).json({ error: "Invalid points value." });
        }
        await User.findOneAndUpdate({ email }, { points: points });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to sync points" }); }
});

// FIX #8: Filter notifications by userId so 'all' broadcast notifs reach everyone
app.get('/api/notifications', async (req, res) => {
    try {
        const { userId } = req.query;
        const query = userId ? { $or: [{ userId }, { userId: 'all' }] } : {};
        const notifs = await Notification.find(query).sort({ _id: -1 }).limit(200);
        res.json(notifs);
    } catch (err) { res.status(500).json({ error: "Fetch notifs failed" }); }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const newNotif = new Notification(req.body);
        await newNotif.save();
        res.json({ success: true, notification: newNotif });
    } catch (err) { res.status(500).json({ error: "Create notif failed" }); }
});

app.put('/api/notifications/:id', async (req, res) => {
    try {
        await Notification.findOneAndUpdate({ id: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update notif failed" }); }
});

app.get('/api/prints', async (req, res) => {
    try {
        const prints = await PrintRequest.find({}).sort({ _id: -1 }).limit(100);
        res.json(prints);
    } catch (err) { res.status(500).json({ error: "Fetch prints failed" }); }
});

app.post('/api/prints', async (req, res) => {
    try {
        const newPrint = new PrintRequest(req.body);
        await newPrint.save();
        res.json({ success: true, print: newPrint });
    } catch (err) { res.status(500).json({ error: "Create print failed" }); }
});

app.put('/api/prints/:id', async (req, res) => {
    try {
        await PrintRequest.findOneAndUpdate({ id: req.params.id }, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update print failed" }); }
});

// --- Master Audit Reports ---

app.get('/api/admin/reports/csv', async (req, res) => {
    try {
        const d = new Date();
        const today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        const allCompletedOrders = await Order.find({ status: 'Completed' }).select('-items');
        const allCompletedPrints = await PrintRequest.find({ status: 'Completed' });

        const filePath = path.join(__dirname, `daily_audit_report_${Date.now()}.csv`); // FIX #9: unique filename to avoid race condition
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: 'completionDate', title: 'Completed At' },
                { id: 'id', title: 'Record ID' },
                { id: 'type', title: 'Type' },
                { id: 'originalTotal', title: 'Original Amount' },
                { id: 'total', title: 'Amount Paid' },
                { id: 'redeemedPoints', title: 'Redeemed?' },
                { id: 'discount', title: 'Discount Amount' }
            ]
        });

        let totalSum = 0;
        const records = [];

        allCompletedOrders.forEach(o => {
            const dateObj = new Date(o.completionDate || o.date);
            if (isNaN(dateObj.getTime())) return; // FIX #10: Skip malformed dates
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            if (formattedDate === today) {
                const disc = o.redeemedPoints ? REDEEM_DISCOUNT_AMOUNT : 0;
                totalSum += Number(o.total || 0);
                records.push({
                    completionDate: formattedDate,
                    id: o.id,
                    type: 'Product',
                    originalTotal: Number(o.originalTotal || (Number(o.total) + disc)),
                    total: Number(o.total),
                    redeemedPoints: o.redeemedPoints ? 'Yes' : 'No',
                    discount: disc
                });
            }
        });

        allCompletedPrints.forEach(pr => {
            const dateObj = new Date(pr.date);
            if (isNaN(dateObj.getTime())) return; // FIX #10: Skip malformed dates
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            if (formattedDate === today) {
                const paid = Number(pr.price || 0);
                totalSum += paid;
                records.push({
                    completionDate: formattedDate,
                    id: pr.id,
                    type: 'Print Service',
                    originalTotal: paid,
                    total: paid,
                    redeemedPoints: 'N/A',
                    discount: 0
                });
            }
        });

        records.push({ completionDate: `DAILY TOTAL (${today})`, total: totalSum });

        await csvWriter.writeRecords(records);
        res.download(filePath, `Daily_Audit_${today.replace(/\//g, '-')}.csv`, () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
    } catch(err) {
        console.error("CSV Export Error:", err);
        res.status(500).send("Report error");
    }
});

app.get('/api/admin/reports/pdf', async (req, res) => {
    try {
        const d = new Date();
        const today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        const allCompletedOrders = await Order.find({ status: 'Completed' }).select('-items');
        const allCompletedPrints = await PrintRequest.find({ status: 'Completed' });

        const doc = new PDFDocument({ margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Daily_Audit_${today.replace(/\//g, '-')}.pdf`);
        doc.pipe(res);

        doc.fontSize(22).text('Daily Master Audit Report', { align: 'center' });
        doc.fontSize(10).text(`Audit Date: ${today}`, { align: 'center' });
        doc.moveDown(2);

        const startX = 30;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', startX, doc.y, { width: 120 });
        doc.text('ID', startX + 130, doc.y, { width: 80 });
        doc.text('Original', startX + 220, doc.y, { width: 80 });
        doc.text('Paid', startX + 310, doc.y, { width: 60 });
        doc.text('Redeem?', startX + 380, doc.y, { width: 60 });
        doc.text('Disc', startX + 450, doc.y, { width: 50 });

        doc.moveDown();
        doc.moveTo(startX, doc.y).lineTo(570, doc.y).stroke().moveDown();

        let totalSum = 0;
        doc.font('Helvetica');

        allCompletedOrders.forEach(o => {
            const dateObj = new Date(o.completionDate || o.date);
            if (isNaN(dateObj.getTime())) return;
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            if (formattedDate === today) {
                const disc = o.redeemedPoints ? REDEEM_DISCOUNT_AMOUNT : 0;
                const paid = Number(o.total || 0);
                totalSum += paid;

                if (doc.y > 700) doc.addPage();
                const y = doc.y;
                doc.text(formattedDate, startX, y, { width: 120 });
                doc.text(String(o.id || 'N/A'), startX + 130, y, { width: 80 });
                doc.text(`Rs.${Number(o.originalTotal || (paid + disc))}`, startX + 220, y, { width: 80 });
                doc.text(`Rs.${paid}`, startX + 310, y, { width: 60 });
                doc.text(o.redeemedPoints ? 'Yes' : 'No', startX + 380, y, { width: 60 });
                doc.text(`Rs.${disc}`, startX + 450, y, { width: 50 });
                doc.moveDown();
            }
        });

        const dailyPrints = [];
        allCompletedPrints.forEach(pr => {
            const dateObj = new Date(pr.date);
            if (isNaN(dateObj.getTime())) return;
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
            if (formattedDate === today) dailyPrints.push(pr);
        });

        if (dailyPrints.length > 0) {
            doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Completed Print Revenue (Today)', startX);
            doc.moveTo(startX, doc.y).lineTo(570, doc.y).stroke().moveDown();
            doc.font('Helvetica').fontSize(10);

            dailyPrints.forEach(pr => {
                const paid = Number(pr.price || 0);
                totalSum += paid;

                if (doc.y > 700) doc.addPage();
                const y = doc.y;
                doc.text(today, startX, y, { width: 120 });
                doc.text(String(pr.id || 'N/A'), startX + 130, y, { width: 80 });
                doc.text(`Rs.${paid}`, startX + 220, y, { width: 80 });
                doc.text(`Rs.${paid}`, startX + 310, y, { width: 60 });
                doc.text('Print', startX + 380, y, { width: 60 });
                doc.text('Rs.0', startX + 450, y, { width: 50 });
                doc.moveDown();
            });
        }

        doc.moveDown();
        doc.moveTo(startX, doc.y).lineTo(570, doc.y).stroke().moveDown();
        doc.fontSize(14).font('Helvetica-Bold').text(`TODAY'S TOTAL REVENUE: Rs.${totalSum.toFixed(2)}`, { align: 'right' });

        doc.end();
    } catch(err) {
        console.error("PDF Report Error:", err);
        if (!res.headersSent) res.status(500).send("PDF Error"); // FIX #11: guard against headers-already-sent error
    }
});

app.post('/api/admin/force-report', async (req, res) => {
    try {
        const report = await generateDailyReport();
        res.json({ success: true, report });
    } catch(err) {
        res.status(500).json({ error: "Report generation failed." });
    }
});

app.post('/api/signup', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        console.error("❌ Signup Attempt Failed: Database is not connected.");
        return res.status(503).json({ error: "Database is connecting/offline. Please try again in 10 seconds." });
    }

    try {
        const { name, email, usn, pwd, refCode } = req.body;
        if (!name || !email || !usn || !pwd) return res.status(400).json({ error: "All fields are required." });

        // FIX #12: Basic length validation to prevent oversized payloads
        if (pwd.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters." });
        if (pwd.length > 128) return res.status(400).json({ error: "Password too long." });

        const existingUser = await User.findOne({ $or: [{ email }, { usn }] });
        if (existingUser) return res.status(400).json({ error: "Email or USN already registered." });

        const referralCode = name.substring(0, 4).toUpperCase().replace(/\s/g, '') + Math.floor(100+Math.random()*900);
        let startingPoints = 50;
        let refUsedByMe = null;

        if (refCode) {
            const referrer = await User.findOne({ referralCode: refCode });
            if (referrer) {
                referrer.points += 50;
                await referrer.save();
                refUsedByMe = refCode;
                startingPoints += 25;
            }
        }

        const newUser = new User({
            name, email, usn, pwd, role: "student",
            points: startingPoints, referralCode, refUsed: refUsedByMe
        });
        await newUser.save();
        res.json({ message: "Signup success", user: newUser });
    } catch(err) {
        console.error("🚩 Signup DB Error:", err);
        res.status(500).json({ error: "Database Save Error: " + (err.code === 11000 ? "USN or Email already exists in records." : err.message) });
    }
});

app.post('/api/login', async (req, res) => {
    const { loginId, pwd } = req.body;
    // FIX #13: Input validation for login
    if (!loginId || !pwd) return res.status(400).json({ error: "Login credentials required." });

    if (loginId === 'admin' || loginId === 'admin@college.edu') {
        if (pwd === 'admin') return res.json({ user: { name: "Admin", email: "admin@college.edu", role: "admin" } });
        return res.status(400).json({ error: "Invalid credentials." });
    }
    const user = await User.findOne({ $or: [{ email: loginId }, { usn: loginId }] }).select('+pwd');
    if (!user || user.pwd !== pwd) return res.status(400).json({ error: "Invalid credentials." });
    const uObj = user.toObject(); delete uObj.pwd;
    res.json({ user: uObj });
});

// FIX #14: 404 handler for unknown routes
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
});

// FIX #14: Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Secure sync active on port ${PORT}`));

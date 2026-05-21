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
            /\.vercel\.app$/.test(origin) ||
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

const NotifyRequestSchema = new mongoose.Schema({
    userId: String,
    productId: Number,
    date: { type: Date, default: Date.now }
});
const NotifyRequest = mongoose.model('NotifyRequest', NotifyRequestSchema);

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

// Local In-Memory Database Fallbacks (for when MongoDB is offline)
let localUsers = [
    { name: "Admin Manager", email: "admin@college.edu", usn: "admin", pwd: "admin", role: "admin", points: 0, referralCode: "ADMIN", refUsed: null }
];
let localOrders = [];
let localNotifications = [];
let localPrintRequests = [];
let localProducts = JSON.parse(JSON.stringify(fallbackProducts));
let localSaleAnalytics = [];
let localRedeemTransactions = [];
let localDailyReports = [];
let localNotifyRequests = [];

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

// Helper function to handle Notifications for Restocked Items
async function handleRestockNotifications(productId, productName) {
    let matches = [];
    if (mongoose.connection.readyState !== 1) {
        matches = localNotifyRequests.filter(r => r.productId === productId);
        localNotifyRequests = localNotifyRequests.filter(r => r.productId !== productId);
    } else {
        matches = await NotifyRequest.find({ productId });
        await NotifyRequest.deleteMany({ productId });
    }

    for (const req of matches) {
        const title = "Item Back In Stock!";
        const desc = `${productName} is available now.`;
        const alertStr = JSON.stringify({ id: productId, name: productName });
        const notifObj = {
            id: (Date.now() + Math.random()).toString(),
            userId: req.userId,
            title,
            desc,
            unread: true,
            timestamp: new Date().toLocaleTimeString(),
            alertStr
        };

        if (mongoose.connection.readyState !== 1) {
            localNotifications.push(notifObj);
        } else {
            const newNotif = new Notification(notifObj);
            await newNotif.save();
        }
    }
}

app.get('/api/products', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        console.warn("⚠️ Serving Catalog from Backup (Local Sync Mode)");
        return res.json(localProducts);
    }
    try {
        let prodList = await Product.find({}).sort({ id: 1 }).maxTimeMS(2000);
        if (prodList.length === 0) {
            await seedProducts();
            prodList = await Product.find({}).sort({ id: 1 });
        }
        res.json(prodList);
    } catch (err) {
        res.json(localProducts);
    }
});

app.post('/api/products/restock', async (req, res) => {
    try {
        const { id, amount } = req.body;
        // FIX #4: Validate restock amount to prevent negative or zero restock
        if (!id || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: "Invalid restock parameters." });
        }

        let prod;
        if (mongoose.connection.readyState !== 1) {
            const match = localProducts.find(p => p.id === id);
            if (!match) return res.status(404).json({ error: "Product not found." });
            match.stock += amount;
            prod = match;
        } else {
            prod = await Product.findOneAndUpdate({ id }, { $inc: { stock: amount } }, { new: true });
            if (!prod) return res.status(404).json({ error: "Product not found." });
        }

        // Trigger restock alerts
        await handleRestockNotifications(id, prod.name);

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
    
    let orders, soldList, stockList, redemptions;

    if (mongoose.connection.readyState !== 1) {
        orders = localOrders.filter(o => o.date && o.date.split(',')[0].trim() === today.split(',')[0].trim());
        soldList = localSaleAnalytics.filter(s => new Date(s.date).toDateString() === new Date().toDateString());
        stockList = localProducts.map(p => ({ name: p.name, stock: p.stock }));
        redemptions = localRedeemTransactions.filter(r => new Date(r.date).toDateString() === new Date().toDateString());
    } else {
        orders = await Order.find({ date: { $regex: today.split(',')[0] } });
        soldList = await SaleAnalytics.find({ date: { $gte: new Date().setHours(0,0,0,0) } });
        stockList = await Product.find({}, 'name stock');
        redemptions = await RedeemTransaction.find({ date: { $gte: new Date().setHours(0,0,0,0) } });
    }

    const totalSales = orders.reduce((sum, o) => sum + (o.status === 'Cancelled' ? 0 : o.total), 0);
    const totalOrders = orders.length;
    const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
    const totalRedeems = redemptions.reduce((sum, r) => sum + r.discountAmount, 0);

    const reportData = {
        date: today,
        totalRevenue: totalSales,
        totalOrders,
        soldProducts: soldList,
        remainingStock: stockList,
        redeemDiscounts: totalRedeems,
        cancelledOrders: cancelledCount
    };

    if (mongoose.connection.readyState !== 1) {
        localDailyReports.push(reportData);
        console.log(`📊 Local Daily Report for ${today} generated successfully.`);
        return reportData;
    } else {
        const report = new DailyReport(reportData);
        await report.save();
        console.log(`📊 Daily Report for ${today} generated successfully.`);
        return report;
    }
}

cron.schedule('0 19 * * *', () => {
    generateDailyReport().catch(err => console.error("Cron report error:", err.message));
});

// --- API Implementation ---

app.get('/api/admin/analytics', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            const totalSales = localSaleAnalytics.reduce((s, i) => s + i.revenue, 0);
            return res.json({ sold: localSaleAnalytics, redeems: localRedeemTransactions, totalSales });
        }
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

        // Authoritative reward points calculation on backend
        const pointsEarned = Math.floor(orderData.total * 0.05);
        orderData.points = pointsEarned;

        if (mongoose.connection.readyState !== 1) {
            localOrders.push(orderData);

            for (const item of orderData.items) {
                if (!item.isBundle && !item.isPrint) {
                    const prod = localProducts.find(p => p.id === item.id);
                    if (prod) prod.stock = Math.max(0, prod.stock - item.qty);

                    // Track sale locally
                    const todayStr = new Date().toDateString();
                    let sale = localSaleAnalytics.find(s => s.productId === item.id && new Date(s.date).toDateString() === todayStr);
                    if (sale) {
                        sale.quantitySold += item.qty;
                        sale.revenue += item.price * item.qty;
                    } else {
                        localSaleAnalytics.push({
                            productId: item.id,
                            productName: item.name,
                            quantitySold: item.qty,
                            revenue: item.price * item.qty,
                            date: new Date()
                        });
                    }
                }
            }

            // Update user points locally
            const user = localUsers.find(u => u.email === orderData.userId);
            if (user) {
                if (orderData.redeemedPoints) {
                    user.points = Math.max(0, user.points - 300);
                }
                user.points += pointsEarned;
            }

            if (orderData.redeemedPoints) {
                localRedeemTransactions.push({
                    orderId: orderData.id,
                    userId: orderData.userId,
                    userName: orderData.userName,
                    productNames: orderData.items.map(i => i.name),
                    discountAmount: REDEEM_DISCOUNT_AMOUNT,
                    finalPrice: orderData.total,
                    date: new Date()
                });
            }
        } else {
            const newOrder = new Order(orderData);
            await newOrder.save();

            for (const item of orderData.items) {
                if (!item.isBundle && !item.isPrint) {
                    await trackSale(item, orderData.date);
                }
            }

            // Sync reward points to user database securely
            const user = await User.findOne({ email: orderData.userId });
            if (user) {
                if (orderData.redeemedPoints) {
                    user.points = Math.max(0, user.points - 300);
                }
                user.points += pointsEarned;
                await user.save();
            }

            if (orderData.redeemedPoints) {
                const rt = new RedeemTransaction({
                    orderId: orderData.id,
                    userId: orderData.userId,
                    userName: orderData.userName,
                    productNames: orderData.items.map(i => i.name),
                    discountAmount: REDEEM_DISCOUNT_AMOUNT,
                    finalPrice: orderData.total
                });
                await rt.save();
            }
        }

        res.json({ success: true, order: orderData });
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

        let existing;
        if (mongoose.connection.readyState !== 1) {
            existing = localOrders.find(o => o.id === req.params.id);
            if (!existing) {
                return res.status(404).json({ error: "Order not found." });
            }

            if (status === 'Cancelled' && existing.status !== 'Cancelled') {
                for (const item of existing.items) {
                    if (!item.isBundle && !item.isPrint) {
                        const prod = localProducts.find(p => p.id === item.id);
                        if (prod) prod.stock += item.qty;
                    }
                }
                const user = localUsers.find(u => u.email === existing.userId);
                if (user) {
                    user.points = Math.max(0, user.points - (existing.points || 0));
                }
            }
            Object.assign(existing, req.body);
        } else {
            existing = await Order.findOne({ id: req.params.id });

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
                const user = await User.findOne({ email: existing.userId });
                if (user) {
                    user.points = Math.max(0, user.points - (existing.points || 0));
                    await user.save();
                }
            }
            await Order.findOneAndUpdate({ id: req.params.id }, req.body);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Order update error:", err);
        res.status(500).json({ error: "Update failed" });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json(localOrders);
        }
        const orders = await Order.find({});
        res.json(orders);
    } catch (err) { res.status(500).json({ error: "Fetch orders failed" }); }
});

app.get('/api/users', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            const safeUsers = localUsers.map(u => {
                const copy = { ...u };
                delete copy.pwd;
                return copy;
            });
            return res.json(safeUsers);
        }
        const users = await User.find({}, '-pwd');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Failed to fetch users" }); }
});

app.delete('/api/users/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (email === 'admin@college.edu') return res.status(403).json({ error: "Cannot delete admin!" });

        if (mongoose.connection.readyState !== 1) {
            const index = localUsers.findIndex(u => u.email === email);
            if (index !== -1) localUsers.splice(index, 1);
            return res.json({ success: true, message: "User deleted successfully" });
        } else {
            await User.findOneAndDelete({ email });
            res.json({ success: true, message: "User deleted successfully" });
        }
    } catch (err) { res.status(500).json({ error: "Failed to delete user" }); }
});

app.post('/api/update-points', async (req, res) => {
    try {
        const { email, points } = req.body;
        // FIX #7: Validate points to prevent negative or NaN values being saved
        if (!email || typeof points !== 'number' || points < 0 || isNaN(points)) {
            return res.status(400).json({ error: "Invalid points value." });
        }
        if (mongoose.connection.readyState !== 1) {
            const user = localUsers.find(u => u.email === email);
            if (user) user.points = points;
            return res.json({ success: true });
        } else {
            await User.findOneAndUpdate({ email }, { points: points });
            res.json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Failed to sync points" }); }
});

// FIX #8: Filter notifications by userId so 'all' broadcast notifs reach everyone
app.get('/api/notifications', async (req, res) => {
    try {
        const { userId } = req.query;
        if (mongoose.connection.readyState !== 1) {
            const notifs = userId 
                ? localNotifications.filter(n => n.userId === userId || n.userId === 'all')
                : localNotifications;
            return res.json(notifs.slice().reverse().slice(0, 200));
        }
        const query = userId ? { $or: [{ userId }, { userId: 'all' }] } : {};
        const notifs = await Notification.find(query).sort({ _id: -1 }).limit(200);
        res.json(notifs);
    } catch (err) { res.status(500).json({ error: "Fetch notifs failed" }); }
});

app.post('/api/notifications', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            localNotifications.push(req.body);
            return res.json({ success: true, notification: req.body });
        } else {
            const newNotif = new Notification(req.body);
            await newNotif.save();
            res.json({ success: true, notification: newNotif });
        }
    } catch (err) { res.status(500).json({ error: "Create notif failed" }); }
});

app.put('/api/notifications/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            const notif = localNotifications.find(n => n.id === req.params.id);
            if (notif) Object.assign(notif, req.body);
            return res.json({ success: true });
        } else {
            await Notification.findOneAndUpdate({ id: req.params.id }, req.body);
            res.json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Update notif failed" }); }
});

app.get('/api/prints', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json(localPrintRequests.slice().reverse().slice(0, 100));
        }
        const prints = await PrintRequest.find({}).sort({ _id: -1 }).limit(100);
        res.json(prints);
    } catch (err) { res.status(500).json({ error: "Fetch prints failed" }); }
});

app.post('/api/prints', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            localPrintRequests.push(req.body);
            return res.json({ success: true, print: req.body });
        } else {
            const newPrint = new PrintRequest(req.body);
            await newPrint.save();
            res.json({ success: true, print: newPrint });
        }
    } catch (err) { res.status(500).json({ error: "Create print failed" }); }
});

app.put('/api/prints/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            const print = localPrintRequests.find(pr => pr.id === req.params.id);
            if (print) Object.assign(print, req.body);
            return res.json({ success: true });
        } else {
            await PrintRequest.findOneAndUpdate({ id: req.params.id }, req.body);
            res.json({ success: true });
        }
    } catch (err) { res.status(500).json({ error: "Update print failed" }); }
});

// --- Notify Requests API ---
app.get('/api/notify-requests', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json(localNotifyRequests);
        }
        const reqs = await NotifyRequest.find({});
        res.json(reqs);
    } catch (err) { res.status(500).json({ error: "Fetch notify requests failed" }); }
});

app.post('/api/notify-requests', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        if (!userId || !productId) {
            return res.status(400).json({ error: "userId and productId required." });
        }
        if (mongoose.connection.readyState !== 1) {
            const exists = localNotifyRequests.some(r => r.userId === userId && r.productId === productId);
            if (exists) return res.json({ success: true, message: "Already requested" });

            const newReq = { id: Date.now().toString(), userId, productId, date: new Date() };
            localNotifyRequests.push(newReq);
            return res.json({ success: true, request: newReq });
        } else {
            const exists = await NotifyRequest.findOne({ userId, productId });
            if (exists) return res.json({ success: true, message: "Already requested" });

            const newReq = new NotifyRequest({ userId, productId });
            await newReq.save();
            return res.json({ success: true, request: newReq });
        }
    } catch (err) { res.status(500).json({ error: "Save notify request failed" }); }
});

// --- Master Audit Reports ---

app.get('/api/admin/reports/csv', async (req, res) => {
    try {
        const d = new Date();
        const today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        const allCompletedOrders = mongoose.connection.readyState !== 1
            ? localOrders.filter(o => o.status === 'Completed')
            : await Order.find({ status: 'Completed' }).select('-items');

        const allCompletedPrints = mongoose.connection.readyState !== 1
            ? localPrintRequests.filter(pr => pr.status === 'Completed')
            : await PrintRequest.find({ status: 'Completed' });

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

        const allCompletedOrders = mongoose.connection.readyState !== 1
            ? localOrders.filter(o => o.status === 'Completed')
            : await Order.find({ status: 'Completed' }).select('-items');

        const allCompletedPrints = mongoose.connection.readyState !== 1
            ? localPrintRequests.filter(pr => pr.status === 'Completed')
            : await PrintRequest.find({ status: 'Completed' });

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
    try {
        const { name, email, usn, pwd, refCode } = req.body;
        if (!name || !email || !usn || !pwd) return res.status(400).json({ error: "All fields are required." });

        // FIX #12: Basic length validation to prevent oversized payloads
        if (pwd.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters." });
        if (pwd.length > 128) return res.status(400).json({ error: "Password too long." });

        let existingUser;
        if (mongoose.connection.readyState !== 1) {
            existingUser = localUsers.find(u => u.email === email || u.usn === usn);
        } else {
            existingUser = await User.findOne({ $or: [{ email }, { usn }] });
        }
        if (existingUser) return res.status(400).json({ error: "Email or USN already registered." });

        const referralCode = name.substring(0, 4).toUpperCase().replace(/\s/g, '') + Math.floor(100+Math.random()*900);
        let startingPoints = 50;
        let refUsedByMe = null;

        if (refCode) {
            let referrer;
            if (mongoose.connection.readyState !== 1) {
                referrer = localUsers.find(u => u.referralCode === refCode);
                if (referrer) {
                    referrer.points += 50;
                    refUsedByMe = refCode;
                    startingPoints += 25;
                }
            } else {
                referrer = await User.findOne({ referralCode: refCode });
                if (referrer) {
                    referrer.points += 50;
                    await referrer.save();
                    refUsedByMe = refCode;
                    startingPoints += 25;
                }
            }
        }

        const userObj = {
            name, email, usn, pwd, role: "student",
            points: startingPoints, referralCode, refUsed: refUsedByMe
        };

        if (mongoose.connection.readyState !== 1) {
            localUsers.push(userObj);
        } else {
            const newUser = new User(userObj);
            await newUser.save();
        }

        const returnedUser = { ...userObj };
        delete returnedUser.pwd;

        res.json({ message: "Signup success", user: returnedUser });
    } catch(err) {
        console.error("🚩 Signup Error:", err);
        res.status(500).json({ error: "Database Save Error: " + (err.code === 11000 ? "USN or Email already exists in records." : err.message) });
    }
});

app.post('/api/login', async (req, res) => {
    const { loginId, pwd } = req.body;
    // FIX #13: Input validation for login
    if (!loginId || !pwd) return res.status(400).json({ error: "Login credentials required." });

    if (loginId === 'admin' || loginId === 'admin@college.edu') {
        if (pwd === 'admin') return res.json({ user: { name: "Admin Manager", email: "admin@college.edu", role: "admin", points: 0, referralCode: "ADMIN", refUsed: null } });
        return res.status(400).json({ error: "Invalid credentials." });
    }

    let user;
    if (mongoose.connection.readyState !== 1) {
        user = localUsers.find(u => (u.email === loginId || u.usn === loginId) && u.pwd === pwd);
        if (!user) return res.status(400).json({ error: "Invalid credentials." });
        const returnedUser = { ...user };
        delete returnedUser.pwd;
        return res.json({ user: returnedUser });
    } else {
        user = await User.findOne({ $or: [{ email: loginId }, { usn: loginId }] }).select('+pwd');
        if (!user || user.pwd !== pwd) return res.status(400).json({ error: "Invalid credentials." });
        const uObj = user.toObject(); delete uObj.pwd;
        res.json({ user: uObj });
    }
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

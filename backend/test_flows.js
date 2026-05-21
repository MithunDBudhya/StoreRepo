// E2E Verification & Audit Test Suite
// Runs programmatically via node to test all core bookstore flow capabilities.

const BASE_URL = 'http://localhost:5000';

async function testSuite() {
    console.log("==================================================");
    console.log("  Smart Campus Bookstore - E2E Verification Test Suite");
    console.log("==================================================");

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
            passed++;
        } else {
            console.log(`\x1b[31m[FAIL]\x1b[0m ${message}`);
            failed++;
        }
    }

    try {
        // --------------------------------------------------
        // TEST 1: Authentication & Input Validation
        // --------------------------------------------------
        console.log("\n--- TEST 1: Authentication & Sign-Up Validation ---");
        
        // 1.1 Password too short
        const signupShortPwdRes = await fetch(`${BASE_URL}/api/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Student',
                email: 'test_student@college.edu',
                usn: '1RV20CS003',
                pwd: '123' // too short (must be >= 4)
            })
        });
        assert(signupShortPwdRes.status === 400, "Should block password shorter than 4 characters");
        const shortPwdErr = await signupShortPwdRes.json();
        assert(shortPwdErr.error === "Password must be at least 4 characters.", `Error message: ${shortPwdErr.error}`);

        // Cleanup user if exists (to make test re-runnable)
        await fetch(`${BASE_URL}/api/users/test_student@college.edu`, { method: 'DELETE' });

        // 1.2 Sign up successfully
        const signupRes = await fetch(`${BASE_URL}/api/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Student',
                email: 'test_student@college.edu',
                usn: '1RV20CS003',
                pwd: 'password123'
            })
        });
        assert(signupRes.status === 200, "Should sign up test student successfully");
        const signupData = await signupRes.json();
        assert(signupData.user.email === 'test_student@college.edu', "Email matches registered user");
        assert(signupData.user.points === 50, `Starting points should be 50, got: ${signupData.user.points}`);
        assert(signupData.user.role === 'student', "Role is student");
        assert(!!signupData.user.referralCode, `Referral code generated: ${signupData.user.referralCode}`);

        // 1.3 Bad Login Credentials
        const loginBadRes = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                loginId: 'test_student@college.edu',
                pwd: 'wrongpassword'
            })
        });
        assert(loginBadRes.status === 400, "Should block login with incorrect password");

        // 1.4 Success Login
        const loginRes = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                loginId: 'test_student@college.edu',
                pwd: 'password123'
            })
        });
        assert(loginRes.status === 200, "Should login test student successfully");
        const loginData = await loginRes.json();
        assert(loginData.user.email === 'test_student@college.edu', "Login user email matches");

        // --------------------------------------------------
        // TEST 2: Notification & Out-of-Stock flow
        // --------------------------------------------------
        console.log("\n--- TEST 2: Notification & Restock Triggers ---");

        // 2.1 Get Products list to locate out of stock product
        const prodsRes = await fetch(`${BASE_URL}/api/products`);
        assert(prodsRes.status === 200, "Should retrieve product catalog");
        const products = await prodsRes.json();
        const recordBook = products.find(p => p.id === 4);
        assert(recordBook && recordBook.stock === 0, "Record Book (id=4) is out-of-stock initially");

        // 2.2 Create notify request
        const notifyReqRes = await fetch(`${BASE_URL}/api/notify-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: 'test_student@college.edu',
                productId: 4
            })
        });
        assert(notifyReqRes.status === 200, "Should create notify request successfully");
        const notifyReqData = await notifyReqRes.json();
        assert(notifyReqData.success === true, "Notify request response reports success");

        // 2.3 Verify request is in registry
        const allReqsRes = await fetch(`${BASE_URL}/api/notify-requests`);
        const allReqs = await allReqsRes.json();
        const activeReq = allReqs.find(r => r.userId === 'test_student@college.edu' && r.productId === 4);
        assert(!!activeReq, "Notify request persists in database registry");

        // 2.4 Restock the out-of-stock product
        const restockRes = await fetch(`${BASE_URL}/api/products/restock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 4,
                amount: 50
            })
        });
        assert(restockRes.status === 200, "Should execute restock successfully");

        // 2.5 Verify notification generated and notify-request cleared
        const checkReqsRes = await fetch(`${BASE_URL}/api/notify-requests`);
        const checkReqs = await checkReqsRes.json();
        const clearedReq = checkReqs.find(r => r.userId === 'test_student@college.edu' && r.productId === 4);
        assert(!clearedReq, "Notify request registry cleared after restock");

        const notifsRes = await fetch(`${BASE_URL}/api/notifications?userId=test_student@college.edu`);
        const notifications = await notifsRes.json();
        const restockNotif = notifications.find(n => n.userId === 'test_student@college.edu' && n.title === "Item Back In Stock!");
        assert(!!restockNotif, "User received 'Item Back In Stock!' notification");
        assert(restockNotif.unread === true, "Notification is unread initially");
        assert(restockNotif.alertStr.includes("Record Book"), "Notification alert string contains product name");

        // --------------------------------------------------
        // TEST 3: Order placement & Points Calculation
        // --------------------------------------------------
        console.log("\n--- TEST 3: Orders & Secured Reward Points ---");

        // 3.1 Place order (buy 2 Record Books, price is 80 each, total is 160)
        const orderId1 = "ORD_" + Date.now();
        const orderRes1 = await fetch(`${BASE_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: orderId1,
                userId: 'test_student@college.edu',
                userName: 'Test Student',
                usn: '1RV20CS003',
                items: [
                    { id: 4, name: 'Record Book', price: 80, qty: 2, isBundle: false, isPrint: false }
                ],
                total: 160,
                date: new Date().toLocaleString(),
                slot: '12:00 PM - 1:00 PM',
                status: 'Placed',
                redeemedPoints: false
            })
        });
        assert(orderRes1.status === 200, "Should place order successfully");

        // Verify stock has decreased
        const prodsAfterRes = await fetch(`${BASE_URL}/api/products`);
        const prodsAfter = await prodsAfterRes.json();
        const recordBookAfter = prodsAfter.find(p => p.id === 4);
        assert(recordBookAfter.stock === 48, `Stock decreased from 50 to 48, got: ${recordBookAfter.stock}`);

        // Verify user points (50 starting + 5% of 160 = 50 + 8 = 58)
        const usersRes = await fetch(`${BASE_URL}/api/users`);
        const users = await usersRes.json();
        const studentRecord = users.find(u => u.email === 'test_student@college.edu');
        assert(studentRecord.points === 58, `Student points earned 5% of 160: expected 58, got: ${studentRecord.points}`);

        // 3.2 Place order with reward point redemption (buy 1 Record Book, redeem points, total = 80 - 30 = 50)
        const orderId2 = "ORD_" + (Date.now() + 1);
        const orderRes2 = await fetch(`${BASE_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: orderId2,
                userId: 'test_student@college.edu',
                userName: 'Test Student',
                usn: '1RV20CS003',
                items: [
                    { id: 4, name: 'Record Book', price: 80, qty: 1, isBundle: false, isPrint: false }
                ],
                total: 50, // Rs. 80 original total - 30 discount
                date: new Date().toLocaleString(),
                slot: '1:00 PM - 2:00 PM',
                status: 'Placed',
                redeemedPoints: true
            })
        });
        assert(orderRes2.status === 200, "Should place order with redeemedPoints=true successfully");

        // Verify points (58 - 300 points (floor 0) + 5% of 50 = 0 + 2 = 2)
        const usersRes2 = await fetch(`${BASE_URL}/api/users`);
        const users2 = await usersRes2.json();
        const studentRecord2 = users2.find(u => u.email === 'test_student@college.edu');
        assert(studentRecord2.points === 2, `Redeemed points correctly: 58 - 300 (floor at 0) + 2 points earned = expected 2, got: ${studentRecord2.points}`);

        // Verify stock has decreased again (48 - 1 = 47)
        const prodsAfterRes2 = await fetch(`${BASE_URL}/api/products`);
        const prodsAfter2 = await prodsAfterRes2.json();
        const recordBookAfter2 = prodsAfter2.find(p => p.id === 4);
        assert(recordBookAfter2.stock === 47, `Stock decreased to 47, got: ${recordBookAfter2.stock}`);

        // --------------------------------------------------
        // TEST 4: Order Cancellation & Point Deductions
        // --------------------------------------------------
        console.log("\n--- TEST 4: Order Cancellation & Stock/Points Recovery ---");

        // Cancel order 1 (which had earned 8 points, user current points is 2)
        const cancelRes1 = await fetch(`${BASE_URL}/api/orders/${orderId1}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Cancelled' })
        });
        assert(cancelRes1.status === 200, "Should cancel order 1 successfully");

        // Verify stock is restored (+2 units: 47 + 2 = 49)
        const prodsAfterCancel = await fetch(`${BASE_URL}/api/products`);
        const prodsAfterCancelData = await prodsAfterCancel.json();
        const recordBookAfterCancel = prodsAfterCancelData.find(p => p.id === 4);
        assert(recordBookAfterCancel.stock === 49, `Stock restored by 2 units to 49, got: ${recordBookAfterCancel.stock}`);

        // Verify points are deducted (current 2 - 8 points earned on order 1 = -6 points, floored at 0)
        const usersAfterCancel = await fetch(`${BASE_URL}/api/users`);
        const usersAfterCancelData = await usersAfterCancel.json();
        const studentAfterCancel = usersAfterCancelData.find(u => u.email === 'test_student@college.edu');
        assert(studentAfterCancel.points === 0, `Points reduced on cancellation: 2 - 8 (floored at 0) = expected 0, got: ${studentAfterCancel.points}`);

        // --------------------------------------------------
        // TEST 5: CSV & PDF Report Download Verification
        // --------------------------------------------------
        console.log("\n--- TEST 5: CSV & PDF Report Accessibility ---");

        const csvReportRes = await fetch(`${BASE_URL}/api/admin/reports/csv`);
        assert(csvReportRes.status === 200, "Daily CSV audit report is accessible (HTTP 200)");
        assert(csvReportRes.headers.get('content-type').includes('csv') || csvReportRes.headers.get('content-disposition').includes('.csv'), "CSV report download header is set");

        const pdfReportRes = await fetch(`${BASE_URL}/api/admin/reports/pdf`);
        assert(pdfReportRes.status === 200, "Daily PDF audit report is accessible (HTTP 200)");
        assert(pdfReportRes.headers.get('content-type').includes('pdf'), "PDF report content-type header is set");

        // Cleanup test user
        await fetch(`${BASE_URL}/api/users/test_student@college.edu`, { method: 'DELETE' });
        console.log("\nCleanup: Test user test_student@college.edu deleted.");

    } catch (err) {
        console.error("Test Suite encountered an unexpected error:", err);
        failed++;
    }

    console.log("\n==================================================");
    console.log(`  Verification Results: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

testSuite();

# PHASE 7.1 — Physical Device Subscription & Razorpay Test Mode Report

**Device:** iQOO `I2223` (Android 15 / API 35)  
**Payment Mode:** Razorpay TEST MODE / Local Dev Staging Simulator (`NO REAL CHARGE`)

---

## 1. Physical-Device Test Results (Part 5 & Part 11 WebView Navigation)

| # | Test Case | Expected Result | Actual Result on iQOO `I2223` | Status |
|---|---|---|---|---|
| 1 | Display all 3 subscription plans | Monthly (`₹200` / 30d), Half-Yearly (`₹500` / 180d), Annual (`₹799` / 365d) | All 3 plans rendered accurately (`phase7_1_device_plans.png`) | **PASSED** |
| 2 | Order creation & amount validation | Backend creates order matching ₹799 (`79900` paise) | Created `order_dev_*` with `Total Payable (Backend Verified) ₹799` (`phase7_1_device_checkout.png`) | **PASSED** |
| 3 | Payment failure flow | Failed payment redirects to Failure screen without activating subscription | Simulated decline → showed `Payment Could Not Be Completed` + Retry CTA | **PASSED** |
| 4 | Payment pending flow | Authorized uncaptured payment stays pending | Simulated bank verification → showed `Payment Pending Verification` | **PASSED** |
| 5 | Payment success & Thank You screen | Verified UPI simulation shows Thank You + Login CTA | Redirected to `/payment/success` showing `Thank You!`, receipt & `Login to Start Learning` (`phase7_1_device_payment_success.png`) | **PASSED** |
| 6 | Payment history | Lists `CAPTURED` and `FAILED` transactions accurately | Navigated to `/payments/history`; both `CAPTURED` and `FAILED` entries rendered | **PASSED** |
| 7 | Login after payment & activation | Clicking Login from Success signs into active Dashboard | Signed in and displayed `Active Class 10 SSC Pass • Valid till 27 Nov 2027` (`phase7_1_device_dashboard.png`) | **PASSED** |
| 8 | Paid lesson access & expired restrictions | Active student accesses paid lessons; expired lease/sub rejected | Paid download assets + `/playback/authorize` succeeded; expired lease blocked in Media3 | **PASSED** (Expiry tested via automated backend + Media3 lease fixture) |
| 9 | Live Razorpay WebView external UPI app handoff (`upi://` / GPay / PhonePe) | Real Razorpay sandbox checkout opens installed UPI app and returns cleanly | Not executed over public internet against live Razorpay sandbox (no live GPay test bank account used; `LmsNavigationPolicy` unit-tested cleanly) | **NOT TESTED** (Physical UPI app handoff requires live Razorpay Sandbox Checkout host & test UPI VPA) |

---

## 2. Physical-Device Bug Fixed During Payment Testing

- **Bug Found on Real Phone:** `dev-preview-server.js`'s local `/api/v1/dev-razorpay/simulate` handler bypassed `app`'s CORS middleware, causing Android WebView (`Origin: http://localhost`) to reject the `POST` response (`Unable to reach server`).
- **Fix Applied:** Added explicit `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials` middleware for allowed origins on `previewApp` in [dev-preview-server.js](file:///d:/Downloads/Android%20apk%20file/backend/scripts/dev-preview-server.js#L581-L590).

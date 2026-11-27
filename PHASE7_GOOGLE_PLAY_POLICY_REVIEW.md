# PHASE 7 — Google Play Policy & Release Decision Document

**Publishing Status:** **NOT PUBLISHED** (Decision & pre-submission review document only)  
**Disclaimer:** This document summarizes technical readiness and highlights Google Play policy areas that require official Play Console policy verification or legal review by the publisher before submission.

---

## 1. Critical Payment Policy Review (India Digital Educational Subscriptions)

- **Context:** This app sells digital educational subscriptions (`₹200` Monthly, `₹500` Half-Yearly, `₹799` Annual) unlocking in-app digital video lectures, notes, and offline downloads.
- **Policy Question Requiring Official Verification / Legal Review:**
  - Under Google Play's Payments Policy, in-app purchases of digital content/subscriptions distributed via Google Play generally require **Google Play Billing**.
  - For users in **India**, Google Play offers the **User Choice Billing (UCB)** / **Alternative Billing for India** programs allowing approved developers to offer an alternative payment processor (such as Razorpay) alongside or instead of Play Billing subject to Play Console enrollment, UX disclosure screens, transaction reporting APIs, and applicable Google service fees.
  - **Risk Flagged:** Shipping an Android APK on Google Play with **standalone Razorpay checkout** *without* enrolling in Google Play's applicable India Alternative/User Choice Billing program (or integrating Google Play Billing) carries a high risk of **Play Store review rejection or app removal**.
  - **Recommended Action Before Submission:** Confirm with your legal counsel and Google Play Console Support whether your release will:
    - *(Option 1)* Integrate **Google Play Billing** directly for in-app subscriptions (zero policy ambiguity), OR
    - *(Option 2)* Enroll in Google Play's **India User Choice / Alternative Billing** program and implement the required Play Billing reporting/disclosure UX alongside Razorpay.

---

## 2. Store Listing, Legal & Compliance Readiness Matrix

| Policy / Listing Requirement | Current Status | Action Needed Before Play Submission |
|---|---|---|
| **Privacy Policy** | In-app `/legal/privacy` exists | Publish at permanent public HTTPS URL and enter in Play Console |
| **Terms & Conditions** | In-app `/legal/terms` exists | Publish at permanent public HTTPS URL |
| **Account & Data Deletion** | **NOT IMPLEMENTED** publicly | Host a public web page explaining how students request account/data deletion & wire backend deletion workflow |
| **Data Safety Form** | Audited (Name, Email, Phone, School, District, Device ID, Payment status, Progress, Security events) | Complete Play Console Data Safety questionnaire accurately |
| **Content Rights (MP4 Lectures)** | Private MP4 storage architecture verified; zero YouTube ripping/downloading | Maintain written copyright ownership documentation for all uploaded lectures |
| **App Access Instructions & Test Account** | Pending staging/prod deployment | Create a dedicated Google Play Reviewer student account (with active subscription) and enter credentials in Play Console → App Access |
| **Release Signing Keystore** | Gradle conditional signing configured (`keystore.properties` excluded from Git) | Generate secure production upload keystore + enroll in **Play App Signing** |
| **Store Listing Assets & Screenshots** | Verified Phase 4 mobile screenshots available (`390×844` / `430×932`) | Create `1024×500` Feature Graphic, `512×512` hi-res icon, and 4–8 Play Store phone screenshots |

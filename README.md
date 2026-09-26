# Budget Tracker — Firebase web app

A personal budget tracker that runs in any browser, installs on your phone's home screen, works offline, and stores your data in your own Firebase (Firestore) database.

Features: monthly income / spending / savings, "safe to spend" after bills, recurring bill checklist, savings goals with a pace estimate, category budgets, payment methods (Cash, M-Pesa, Mixx by Yas, Airtel Money, Bank, Card), search across months, 6-month chart, CSV download and import.

Firebase's free Spark plan is more than enough for personal use.

---

## 1. Create the Firebase project (about 5 minutes)

1. Go to https://console.firebase.google.com and click **Add project**. Name it, e.g. `my-budget`. Google Analytics is optional; you can turn it off.
2. **Register a web app:** on the project overview page click the **</>** (Web) icon, give it a nickname, tick **"Also set up Firebase Hosting"**, and click **Register app**. You'll see a `firebaseConfig = { ... }` block — copy it.
3. Open `firebase-config.js` in this folder and replace the placeholder values with yours.
4. **Turn on sign-in:** Build → **Authentication** → Get started → **Sign-in method** tab. Enable **Email/Password**, and optionally **Google**.
5. **Create the database:** Build → **Firestore Database** → Create database. Pick a location close to you (e.g. `europe-west` or `me-central`), and start in **production mode**. The rules file in this folder is deployed in step 2 below.

## 2. Put it online with Firebase Hosting

You need Node.js installed (https://nodejs.org). Then, in a terminal inside this folder:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick the project you created, alias it "default"
firebase deploy             # uploads the app and the security rules
```

When it finishes it prints your address, like `https://my-budget.web.app`. That's your app.

To update later: edit files, change `VERSION` in `sw.js` (e.g. `budget-v2`), and run `firebase deploy` again.

## 3. Add it to your phone's home screen

Open your `https://….web.app` address on your phone and sign in.

- **iPhone (Safari):** Share button → **Add to Home Screen** → Add.
- **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**).

It then opens full-screen with its own icon, like any app, and keeps working without internet. Entries you add offline sync automatically when you're back online.

**Tip for iPhone:** inside the installed home-screen app, email/password sign-in is the most reliable. Google sign-in works best if you sign in once in Safari first, then add to home screen.

## Moving entries across from the claude.ai version

In the claude.ai tracker: Settings → **Download all entries (CSV)**. In this app: Settings → **Import CSV** and pick that file. Duplicates are skipped, so importing twice is safe. (Set up your savings goals with the same names first, so savings entries attach to them.)

## How your data is stored

```
users/{your user id}/config/settings     ← currency, categories, budgets, bills, goals, methods
users/{your user id}/months/{YYYY-MM}    ← that month's entries
```

`firestore.rules` only lets a signed-in user read and write their own `users/{uid}` data, so nobody else — even with your app's address — can see your budget.

The `apiKey` in `firebase-config.js` is not a secret; it only identifies your project. Your data is protected by sign-in plus the rules above.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `firebase-config.js` | Your Firebase project settings (you fill this in) |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |
| `sw.js` | Offline support |
| `firestore.rules` | Database security (private per user) |
| `firebase.json` | Hosting and rules settings for `firebase deploy` |

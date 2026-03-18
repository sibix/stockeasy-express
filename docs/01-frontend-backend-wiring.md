# Frontend to Backend Wiring — StockEasy

## Overview

Every screen in StockEasy follows the same pattern:

```
HTML Form → JavaScript → fetch() → Express Route → Database
                                                        ↓
HTML Updates ← response.ok ← res.json() ←─────────────┘
```

---

## Step 1 — The HTML Form

```html
<form id="my-form" onsubmit="handleSubmit(event)" novalidate>
  <input type="text" id="username" />
  <button type="submit">Submit</button>
</form>
```

| Attribute                        | Why                                   |
| -------------------------------- | ------------------------------------- |
| `onsubmit="handleSubmit(event)"` | Runs our JS instead of default submit |
| `novalidate`                     | We handle validation ourselves        |
| No `action=""`                   | Page never reloads                    |

---

## Step 2 — The JavaScript Function

```javascript
async function handleSubmit(e) {
  // STEP 1 — Stop page reload
  e.preventDefault();

  // STEP 2 — Read input values
  const username = document.getElementById("username").value.trim();

  // STEP 3 — Validate on frontend first
  if (!username) {
    showError("Username is required.");
    return; // stop here — do not call server
  }

  // STEP 4 — Send to Express via fetch
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

  // STEP 5 — Parse server response
  const data = await response.json();

  // STEP 6 — Handle result
  if (response.ok) {
    window.location.href = "/dashboard.html"; // success
  } else {
    showError(data.error); // show server error message
  }
}
```

---

## Step 3 — The Express Route

```javascript
router.post("/login", async (req, res) => {
  // Read what fetch() sent
  const { username, password } = req.body;

  // Validate on server too — never trust frontend alone
  if (!username || !password) {
    return res.status(400).json({ error: "All fields required" });
  }

  // Query database
  const [users] = await db.execute("SELECT * FROM auth WHERE username = ?", [
    username,
  ]);

  // Send response back to fetch()
  if (users.length > 0) {
    res.json({ message: "Welcome!" }); // status 200 → response.ok = true
  } else {
    res.status(401).json({ error: "Invalid" }); // response.ok = false
  }
});
```

---

## The Complete Data Flow

```
User types username + password
          ↓
handleLogin(e) runs
          ↓
e.preventDefault() — page does not reload
          ↓
fetch('/auth/login', { method: 'POST', body: JSON })
          ↓
Express receives request
req.body = { username: 'admin', password: 'admin123' }
          ↓
Query database → find user
          ↓
bcrypt.compare() → check password
          ↓
         ┌─────────────────┐
         │                 │
      Match ✅          No match ❌
         │                 │
res.json({            res.status(401)
  message:            .json({
  'Welcome!'            error: 'Invalid'
})                    })
         │                 │
         └────────┬────────┘
                  ↓
      fetch receives response
                  ↓
         ┌─────────────────┐
         │                 │
    response.ok        !response.ok
         │                 │
   redirect to        showError()
   dashboard.html     shake form
```

---

## HTTP Status Codes Used

| Code  | Meaning      | When used             |
| ----- | ------------ | --------------------- |
| `200` | OK           | Default success       |
| `201` | Created      | New record saved      |
| `400` | Bad Request  | Validation failed     |
| `401` | Unauthorized | Wrong credentials     |
| `403` | Forbidden    | No permission         |
| `404` | Not Found    | Record does not exist |
| `500` | Server Error | Something crashed     |

---

## The Universal 4-Step Fetch Pattern

Use this pattern on every screen in the app:

```javascript
// 1. Read from inputs
const value = document.getElementById("field-id").value;

// 2. Validate
if (!value) {
  showError("Required");
  return;
}

// 3. Send to server
const response = await fetch("/route", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ value }),
});

// 4. Handle response
const data = await response.json();
if (response.ok) {
  // success — redirect or update UI
} else {
  showError(data.error);
}
```

**Only two things change per screen:**

- The fetch URL `/route`
- The field names in `JSON.stringify()`

---

## Recent Users Feature — auth.html

Recent users are stored in `localStorage` — no server needed.

```javascript
// Save on successful login
saveRecentUser(username);

// localStorage stores max 3 users
[
  { username: "admin", initial: "A", lastLogin: "2024..." },
  { username: "cashier", initial: "C", lastLogin: "2024..." },
  { username: "manager", initial: "M", lastLogin: "2024..." },
];

// On page load — render chips
renderRecentUsers();

// Click chip — fills username field
function selectRecentUser(username) {
  document.getElementById("username").value = username;
  document.getElementById("password").focus();
}
```

---

## Key Rules to Remember

1. **Always validate on server** — never trust frontend validation alone
2. **Never store plain text passwords** — always use bcrypt
3. **Use response.ok** — not status codes directly in fetch
4. **Always use try/catch** — network errors must be handled
5. **Send JSON, receive JSON** — always set Content-Type header

---

_StockEasy Dev Docs — Updated 2026_

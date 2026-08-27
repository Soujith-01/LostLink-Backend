# LostLink - Digital Lost-and-Found Backend API

**LostLink** is a secure, modern digital Lost-and-Found system backend built with the **MERN (MongoDB, Express, React, Node.js)** stack. It provides robust authentication, intelligent weighted attribute matching between lost and found items, verification question/answer claim security, image uploads via Cloudinary, and admin moderation dashboards.

---

## 🚀 Key Features

1. **User Authentication & Authorization**: Registration, login, profile management, JWT tokens, HTTP-only cookies, password hashing with `bcryptjs`, role-based access (`user` vs `admin`).
2. **Item Posting & Moderation**: Post LOST or FOUND items with metadata (title, category, location, date, multi-image upload via Cloudinary).
3. **Smart Weighted Item Matching**: Modular service algorithm (`matchingService.js`) that compares LOST and FOUND items using weighted similarity:
   - **Category Match**: 30%
   - **Title Token Similarity**: 25%
   - **Description/Keywords Similarity**: 20%
   - **Location Proximity (City & Area)**: 15%
   - **Date Proximity**: 10%
4. **Secure Claim & Verification System**:
   - Verification Question/Answer setup for FOUND items.
   - Case-insensitive & trimmed answer comparison.
   - Zero leak policy (`verificationAnswer` masked via Mongoose `select: false`).
   - Auto-rejection of other pending claims upon claim approval and item status update (`claimed`).
5. **Admin Dashboard & Moderation**: System-wide analytics (`/api/admin/stats`), user status toggling, and item/claim deletion.
6. **Security & Validation**: Input validation with `express-validator`, security HTTP headers via `helmet`, CORS configuration, and centralized error handling.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js (ES Modules `"type": "module"`)
- **Framework**: Express.js
- **Database**: MongoDB & Mongoose ORM
- **Authentication**: JSON Web Tokens (JWT) & bcryptjs
- **Media Storage**: Cloudinary (via Multer memory storage streams)
- **Validation**: express-validator
- **Security & Utilities**: Helmet, CORS, Cookie-Parser, Morgan

---

## 📂 Architecture & Directory Layout

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js             # MongoDB Mongoose connection handler
│   │   └── cloudinary.js     # Cloudinary SDK & stream upload helper
│   ├── controllers/
│   │   ├── authController.js # Registration, login, me, logout
│   │   ├── itemController.js # Lost/Found items CRUD, search, matches
│   │   ├── claimController.js# Submit claims, verification, approval
│   │   └── adminController.js# User/item management & stats
│   ├── models/
│   │   ├── User.js           # User schema with password hashing & roles
│   │   ├── Item.js           # Item schema with text search & indexes
│   │   └── Claim.js          # Claim schema with status & relationships
│   ├── routes/
│   │   ├── authRoutes.js     # /api/auth routes
│   │   ├── itemRoutes.js     # /api/items routes
│   │   ├── claimRoutes.js    # /api/claims routes
│   │   └── adminRoutes.js    # /api/admin routes
│   ├── middleware/
│   │   ├── authMiddleware.js # JWT verification
│   │   ├── roleMiddleware.js # Admin role authorization
│   │   ├── validationMiddleware.js # express-validator wrapper
│   │   └── errorMiddleware.js# Centralized error handler
│   ├── services/
│   │   └── matchingService.js# Smart weighted item matching algorithm
│   ├── utils/
│   │   ├── multer.js         # Memory storage upload helper
│   │   └── testApi.js        # Automated integration test runner
│   └── server.js             # DB connection & Express server launcher
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- Node.js (v18+)
- MongoDB database (Local instance or MongoDB Atlas URI)
- Cloudinary Account (for image uploads)

### 2. Environment Configuration
Create a `.env` file in the root `backend/` directory:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/lostlink
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLIENT_URL=http://localhost:5173
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Development Server
```bash
npm run dev
```

The server will start on `http://localhost:3000`.

---

## 🔌 API Reference

### Health Check
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Verify server health status |

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new user account |
| `POST` | `/api/auth/login` | Public | User login & receive JWT token |
| `GET` | `/api/auth/me` | Protected | Fetch current logged-in user profile |
| `POST` | `/api/auth/logout` | Public | Logout user & clear cookies |

### Items (`/api/items`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/items` | Protected | Create a LOST or FOUND item post |
| `GET` | `/api/items` | Public | Search & filter items with pagination |
| `GET` | `/api/items/my` | Protected | Get items posted by logged-in user |
| `GET` | `/api/items/:id` | Public | Get single item details |
| `PUT` | `/api/items/:id` | Owner/Admin | Update item details or add images |
| `DELETE` | `/api/items/:id` | Owner/Admin | Delete item post |
| `GET` | `/api/items/:id/matches` | Public | Calculate candidate matches for item |

### Claims (`/api/claims`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/claims/:itemId` | Protected | Claim a found item with answer |
| `GET` | `/api/claims/my` | Protected | Get claims submitted by user |
| `GET` | `/api/claims/item/:itemId` | Owner | Get all claims for an item |
| `GET` | `/api/claims/:id` | Claimant/Owner | Get single claim details |
| `PUT` | `/api/claims/:id/approve` | Owner/Admin | Approve claim & mark item claimed |
| `PUT` | `/api/claims/:id/reject` | Owner/Admin | Reject pending claim |

### Admin (`/api/admin`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Admin | Get system statistics |
| `GET` | `/api/admin/users` | Admin | List all registered users |
| `GET` | `/api/admin/items` | Admin | Moderation view for all items |
| `GET` | `/api/admin/claims` | Admin | Moderation view for all claims |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user account |
| `DELETE` | `/api/admin/items/:id` | Admin | Delete item post |
| `PUT` | `/api/admin/users/:id/status` | Admin | Toggle user active status |

---

## 🧪 Testing

Run the automated API integration test suite to test authentication, security, item posting, weighted matching, claims verification, and admin routes:

```bash
npm run test:api
```

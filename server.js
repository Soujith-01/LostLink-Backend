import exp from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import mongoose from 'mongoose'

import userApp from './APIS/userApi.js'
import itemApp from './APIS/ItemApi.js'
import claimApp from './APIS/ClaimApi.js'
import adminApp from './APIS/AdminApi.js'
import notificationApp from './APIS/notificationApi.js'

import { notFound, errorHandler } from './middlewares/errorMiddleware.js'

config()

const app = exp()
const server = createServer(app)
const PORT = parseInt(process.env.PORT, 10) || 3000

// Socket.io setup
const io = new Server(server, {
	cors: {
		origin: process.env.CLIENT_URL
			? process.env.CLIENT_URL.split(',').map((o) => o.trim())
			: ['http://localhost:5173', 'http://127.0.0.1:5173'],
		methods: ['GET', 'POST'],
		credentials: true,
	},
})

// Track connected users: userId -> Set of socket IDs
const connectedUsers = new Map()

io.on('connection', (socket) => {
	console.log(`[Socket] Client connected: ${socket.id}`)

	// User registers their userId with the socket
	socket.on('register', (userId) => {
		if (userId) {
			socket.userId = userId
			if (!connectedUsers.has(userId)) {
				connectedUsers.set(userId, new Set())
			}
			connectedUsers.get(userId).add(socket.id)
			console.log(`[Socket] User ${userId} registered with socket ${socket.id}`)
		}
	})

	socket.on('disconnect', () => {
		if (socket.userId && connectedUsers.has(socket.userId)) {
			connectedUsers.get(socket.userId).delete(socket.id)
			if (connectedUsers.get(socket.userId).size === 0) {
				connectedUsers.delete(socket.userId)
			}
		}
		console.log(`[Socket] Client disconnected: ${socket.id}`)
	})
})

// Make io and connectedUsers accessible in route handlers
app.set('io', io)
app.set('connectedUsers', connectedUsers)

app.use(helmet())

const allowedOrigins = process.env.CLIENT_URL
	? process.env.CLIENT_URL.split(',').map((o) => o.trim())
	: ['http://localhost:5173', 'http://127.0.0.1:5173']

app.use(
	cors({
		origin: (origin, callback) => {
			if (!origin || allowedOrigins.includes(origin)) {
				callback(null, true)
			} else {
				callback(null, true)
			}
		},
		credentials: true,
	})
)

if (process.env.NODE_ENV !== 'production') {
	app.use(morgan('dev'))
}

app.use(exp.json({ limit: '10mb' }))
app.use(exp.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Health check endpoint
app.get('/api/health', (req, res) => {
	res.status(200).json({ message: 'LostLink API is running', timestamp: new Date().toISOString() })
})

// Route API apps
app.use('/api/user', userApp)
app.use('/api/items', itemApp)
app.use('/api/claims', claimApp)
app.use('/api/admin', adminApp)
app.use('/api/notifications', notificationApp)

app.use(notFound)
app.use(errorHandler)

process.on('uncaughtException', (err) => {
	console.error(`[Uncaught Exception] ${err.name}: ${err.message}`)
	console.error(err.stack)
	process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
	console.error('[Unhandled Rejection] at:', promise, 'reason:', reason)
})

const startServer = async () => {
	try {
		const mongoUri = process.env.MONGODB_URI || process.env.DB_URL
		if (mongoUri) {
			await mongoose.connect(mongoUri)
			console.log('[MongoDB] Connected successfully')
		}
	server.listen(PORT, () => {
		console.log(`[LostLink Server] Listening on port ${PORT}`)
	})
	return server
	} catch (err) {
		console.error(`[DB Error] ${err.message}`)
	}
}

if (process.env.NODE_ENV !== 'test') {
	startServer()
}

export { app, startServer }
export default app

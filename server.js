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
const httpServer = createServer(app)
const PORT = parseInt(process.env.PORT, 10) || 3000

const io = new Server(httpServer, {
	cors: {
		origin: process.env.CLIENT_URL
			? process.env.CLIENT_URL.split(',').map((o) => o.trim())
			: ['http://localhost:5173', 'http://127.0.0.1:5173'],
		methods: ['GET', 'POST'],
		credentials: true,
	},
})

const connectedUsers = new Map()

io.on('connection', (socket) => {
	console.log(`[Socket] Client connected: ${socket.id}`)

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

app.get('/api/health', (req, res) => {
	res.status(200).json({ message: 'LostLink API is running', timestamp: new Date().toISOString() })
})

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
	const mongoCandidates = [process.env.MONGODB_URI, process.env.DB_URL].filter(Boolean)
	let mongoConnected = false

	for (const mongoUri of mongoCandidates) {
		try {
			await mongoose.connect(mongoUri)
			console.log('[MongoDB] Connected successfully')
			mongoConnected = true
			break
		} catch (err) {
			console.error(`[MongoDB] Failed to connect using configured URI: ${err.message}`)
		}
	}

	if (!mongoConnected && mongoCandidates.length > 0) {
		console.warn('[MongoDB] Server started without a successful database connection. Check your MongoDB URI or network access.')
	}

	httpServer.listen(PORT, () => {
		console.log(`[LostLink Server] Listening on port ${PORT}`)
	})

	return httpServer
}

if (process.env.NODE_ENV !== 'test') {
	startServer()
}

export { app, startServer, io }
export default app

import exp from 'express'
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

import { notFound, errorHandler } from './middlewares/errorMiddleware.js'

config()

const app = exp()
const PORT = parseInt(process.env.PORT, 10) || 3000

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
		const server = app.listen(PORT, () => {
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

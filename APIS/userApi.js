import exp from 'express'
import { config } from 'dotenv'
import jwt from 'jsonwebtoken'
import { verifyToken } from '../middlewares/verifyToken.js'
import UserModel from '../models/UserModel.js'

export const userApp = exp.Router()
config()

const generateToken = (userId) => {
	return jwt.sign(
		{ id: userId, userId },
		process.env.JWT_SECRET || process.env.SECRET_KEY || 'default_secret',
		{ expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
	)
}

// User Registration
userApp.post('/register', async (req, res) => {
	const { name, email, password, phone, role } = req.body

	if (!name || !email || !password) {
		return res.status(400).json({ message: 'Name, email, and password are required' })
	}

	const existingUser = await UserModel.findOne({ email })
	if (existingUser) {
		return res.status(400).json({ message: 'User already exists with this email' })
	}

	const assignedRole = role === 'admin' && req.user?.role === 'admin' ? 'admin' : 'user'
	const user = await UserModel.create({
		name,
		email,
		password,
		phone: phone || '',
		role: assignedRole,
	})

	const token = generateToken(user._id)
	const userObj = user.toObject()
	delete userObj.password

	res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 })
	res.status(201).json({ message: 'User registered successfully', token, user: userObj })
})

// User Login
userApp.post('/login', async (req, res) => {
	const { email, password } = req.body

	if (!email || !password) {
		return res.status(400).json({ message: 'Email and password are required' })
	}

	const user = await UserModel.findOne({ email }).select('+password')
	if (!user) {
		return res.status(401).json({ message: 'Invalid credentials. User not found' })
	}

	if (!user.isActive) {
		return res.status(403).json({ message: 'Your account has been deactivated' })
	}

	const isMatch = await user.matchPassword(password)
	if (!isMatch) {
		return res.status(401).json({ message: 'Invalid credentials. Incorrect password' })
	}

	const token = generateToken(user._id)
	const userObj = user.toObject()
	delete userObj.password

	res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 })
	res.status(200).json({ message: 'Login successful', token, user: userObj })
})

// Get Profile for Authenticated User
userApp.get('/profile', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const user = await UserModel.findById(req.user.userId).select('-password')
	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}
	res.status(200).json({ user })
})

// Alias for /me profile route
userApp.get('/me', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const user = await UserModel.findById(req.user.userId).select('-password')
	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}
	res.status(200).json({ user })
})

// User Logout
userApp.post('/logout', async (req, res) => {
	res.cookie('token', 'none', { expires: new Date(Date.now() + 5000), httpOnly: true })
	res.status(200).json({ message: 'Logged out successfully' })
})

export default userApp

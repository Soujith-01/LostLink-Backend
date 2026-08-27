import exp from 'express'
import { config } from 'dotenv'
import { verifyToken } from '../middlewares/verifyToken.js'
import UserModel from '../models/UserModel.js'
import ItemModel from '../models/ItemModel.js'
import ClaimModel from '../models/ClaimModel.js'

export const adminApp = exp.Router()
config()

// Get system dashboard statistics
adminApp.get('/statistics', verifyToken('ADMIN'), async (req, res) => {
	const totalUsers = await UserModel.countDocuments()
	const activeUsers = await UserModel.countDocuments({ isActive: true })
	const totalItems = await ItemModel.countDocuments()
	const activeItems = await ItemModel.countDocuments({ status: 'active' })
	const claimedItems = await ItemModel.countDocuments({ status: 'claimed' })
	const lostItems = await ItemModel.countDocuments({ type: 'lost' })
	const foundItems = await ItemModel.countDocuments({ type: 'found' })
	const totalClaims = await ClaimModel.countDocuments()
	const pendingClaims = await ClaimModel.countDocuments({ status: 'pending' })
	const approvedClaims = await ClaimModel.countDocuments({ status: 'approved' })

	res.status(200).json({
		totalUsers,
		activeUsers,
		totalItems,
		items: { active: activeItems, claimed: claimedItems, lost: lostItems, found: foundItems },
		claims: { total: totalClaims, pending: pendingClaims, approved: approvedClaims },
	})
})

// List all registered users
adminApp.get('/users', verifyToken('ADMIN'), async (req, res) => {
	const { page = 1, limit = 10, search } = req.query
	const query = {}

	if (search) {
		query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }]
	}

	const skip = (parseInt(page) - 1) * parseInt(limit)
	const users = await UserModel.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
	const totalUsers = await UserModel.countDocuments(query)

	res.status(200).json({ users, totalUsers })
})

// List all items for moderation
adminApp.get('/items', verifyToken('ADMIN'), async (req, res) => {
	const { page = 1, limit = 10, type, status, category } = req.query
	const query = {}

	if (type) query.type = type
	if (status) query.status = status
	if (category) query.category = category

	const skip = (parseInt(page) - 1) * parseInt(limit)
	const items = await ItemModel.find(query).populate('postedBy', 'name email avatar').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
	const totalItems = await ItemModel.countDocuments(query)

	res.status(200).json({ items, totalItems })
})

// List all claims for moderation
adminApp.get('/claims', verifyToken('ADMIN'), async (req, res) => {
	const { page = 1, limit = 10, status } = req.query
	const query = {}

	if (status) query.status = status

	const skip = (parseInt(page) - 1) * parseInt(limit)
	const claims = await ClaimModel.find(query)
		.populate('item', 'title category type status')
		.populate('claimant', 'name email avatar')
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(parseInt(limit))
	const totalClaims = await ClaimModel.countDocuments(query)

	res.status(200).json({ claims, totalClaims })
})

// Promote or demote user role
adminApp.patch('/users/:userId/role', verifyToken('ADMIN'), async (req, res) => {
	const { role } = req.body
	if (!['user', 'admin'].includes(String(role).toLowerCase())) {
		return res.status(400).json({ message: 'Invalid role. Must be user or admin' })
	}

	const user = await UserModel.findByIdAndUpdate(req.params.userId, { role: role.toLowerCase() }, { new: true }).select('-password')
	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}

	res.status(200).json({ message: 'Role updated successfully', user })
})

// Enable or disable user account status
adminApp.patch('/users/:userId/status', verifyToken('ADMIN'), async (req, res) => {
	const { isActive } = req.body
	const user = await UserModel.findByIdAndUpdate(
		req.params.userId,
		{ isActive: Boolean(isActive) },
		{ new: true }
	).select('-password')

	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}

	res.status(200).json({ message: 'User status updated', user })
})

// Deactivate a user account
adminApp.patch('/users/:userId/deactivate', verifyToken('ADMIN'), async (req, res) => {
	const user = await UserModel.findByIdAndUpdate(
		req.params.userId,
		{ isActive: false },
		{ new: true }
	).select('-password')

	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}

	res.status(200).json({ message: 'User account deactivated', user })
})

// Delete a user account
adminApp.delete('/users/:userId', verifyToken('ADMIN'), async (req, res) => {
	const user = await UserModel.findById(req.params.userId)
	if (!user) {
		return res.status(404).json({ message: 'User not found' })
	}

	if (String(user._id) === String(req.user.userId)) {
		return res.status(400).json({ message: 'Admins cannot delete their own account' })
	}

	await user.deleteOne()
	res.status(200).json({ message: 'User deleted successfully' })
})

// Delete an item post
adminApp.delete('/items/:itemId', verifyToken('ADMIN'), async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	await item.deleteOne()
	res.status(200).json({ message: 'Item deleted successfully' })
})

export default adminApp

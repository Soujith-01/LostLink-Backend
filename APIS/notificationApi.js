import exp from 'express'
import { config } from 'dotenv'
import { verifyToken } from '../middlewares/verifyToken.js'
import NotificationModel from '../models/NotificationModel.js'

export const notificationApp = exp.Router()
config()

// Get all notifications for the current user
notificationApp.get('/', verifyToken('USER', 'ADMIN'), async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query
		const skip = (parseInt(page) - 1) * parseInt(limit)

		const notifications = await NotificationModel.find({ recipient: req.user.userId })
			.populate('sender', 'name email avatar')
			.populate('itemId', 'title type category')
			.populate('claimId', 'status answer')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))

		const totalNotifications = await NotificationModel.countDocuments({ recipient: req.user.userId })
		const unreadCount = await NotificationModel.countDocuments({ recipient: req.user.userId, isRead: false })

		res.status(200).json({ notifications, totalNotifications, unreadCount })
	} catch (error) {
		console.error('[Notifications Error]', error.message)
		res.status(500).json({ message: 'Failed to fetch notifications' })
	}
})

// Get unread notification count
notificationApp.get('/unread-count', verifyToken('USER', 'ADMIN'), async (req, res) => {
	try {
		const unreadCount = await NotificationModel.countDocuments({ recipient: req.user.userId, isRead: false })
		res.status(200).json({ unreadCount })
	} catch (error) {
		console.error('[Unread Count Error]', error.message)
		res.status(500).json({ message: 'Failed to fetch unread count' })
	}
})

// Mark a notification as read
notificationApp.patch('/:notificationId/read', verifyToken('USER', 'ADMIN'), async (req, res) => {
	try {
		const notification = await NotificationModel.findOneAndUpdate(
			{ _id: req.params.notificationId, recipient: req.user.userId },
			{ isRead: true },
			{ new: true }
		)

		if (!notification) {
			return res.status(404).json({ message: 'Notification not found' })
		}

		res.status(200).json({ message: 'Notification marked as read', notification })
	} catch (error) {
		console.error('[Mark Read Error]', error.message)
		res.status(500).json({ message: 'Failed to mark notification as read' })
	}
})

// Mark all notifications as read
notificationApp.patch('/mark-all-read', verifyToken('USER', 'ADMIN'), async (req, res) => {
	try {
		await NotificationModel.updateMany(
			{ recipient: req.user.userId, isRead: false },
			{ isRead: true }
		)

		res.status(200).json({ message: 'All notifications marked as read' })
	} catch (error) {
		console.error('[Mark All Read Error]', error.message)
		res.status(500).json({ message: 'Failed to mark notifications as read' })
	}
})

// Delete a notification
notificationApp.delete('/:notificationId', verifyToken('USER', 'ADMIN'), async (req, res) => {
	try {
		const notification = await NotificationModel.findOneAndDelete({
			_id: req.params.notificationId,
			recipient: req.user.userId,
		})

		if (!notification) {
			return res.status(404).json({ message: 'Notification not found' })
		}

		res.status(200).json({ message: 'Notification deleted' })
	} catch (error) {
		console.error('[Delete Notification Error]', error.message)
		res.status(500).json({ message: 'Failed to delete notification' })
	}
})

export default notificationApp

import exp from 'express'
import { config } from 'dotenv'
import { verifyToken } from '../middlewares/verifyToken.js'
import ClaimModel from '../models/ClaimModel.js'
import ItemModel from '../models/ItemModel.js'
import NotificationModel from '../models/NotificationModel.js'

export const claimApp = exp.Router()
config()

// Submit a claim on a found item
claimApp.post('/claims/:itemId', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const { answer, message } = req.body
	if (!answer) {
		return res.status(400).json({ message: 'Answer is required for claim verification' })
	}

	const item = await ItemModel.findById(req.params.itemId).select('+verificationAnswer')
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (item.type !== 'found') {
		return res.status(400).json({ message: 'Only FOUND items can be claimed' })
	}

	if (item.status !== 'active') {
		return res.status(400).json({ message: `Item is ${item.status} and cannot accept claims` })
	}

	if (String(item.postedBy) === String(req.user.userId)) {
		return res.status(400).json({ message: 'You cannot claim an item you posted yourself' })
	}

	const existingClaim = await ClaimModel.findOne({
		item: req.params.itemId,
		claimant: req.user.userId,
		status: { $in: ['pending', 'approved'] },
	})

	if (existingClaim) {
		return res.status(400).json({ message: 'You already have an active claim for this item' })
	}    // Auto-verify the answer against the item's verification answer
	const isAnswerCorrect =
		item.verificationAnswer &&
		String(answer).trim().toLowerCase() === item.verificationAnswer.toLowerCase().trim()

	const claimStatus = isAnswerCorrect ? 'verified' : 'pending'

	const claim = await ClaimModel.create({
		item: req.params.itemId,
		claimant: req.user.userId,
		answer: String(answer).trim(),
		message: message || '',
		status: claimStatus,
	})

	const statusMessage = isAnswerCorrect
		? 'Verification answer correct! Your claim has been verified and sent to the item owner for review.'
		: 'Claim submitted. The item owner will review your claim.'

	// If answer is correct, send notification to item owner
	if (isAnswerCorrect) {
		const claimant = await import('../models/UserModel.js').then(m => m.default.findById(req.user.userId))

		const notification = await NotificationModel.create({
			recipient: item.postedBy,
			sender: req.user.userId,
			type: 'claim_verified',
			title: 'New Verified Claim on Your Item!',
			message: `${claimant?.name || 'Someone'} has answered the verification question correctly for your ${item.type === 'lost' ? 'lost' : 'found'} item "${item.title}". Please review and decide whether to deliver the item.`,
			itemId: item._id,
			claimId: claim._id,
		})

		// Emit real-time notification via Socket.io
		const io = req.app.get('io')
		const connectedUsers = req.app.get('connectedUsers')
		if (io && connectedUsers) {
			const ownerSockets = connectedUsers.get(String(item.postedBy))
			if (ownerSockets) {
				for (const socketId of ownerSockets) {
					io.to(socketId).emit('notification', {
						...notification.toObject(),
						sender: { _id: req.user.userId, name: claimant?.name || 'Someone' },
						itemId: { _id: item._id, title: item.title, type: item.type },
					})
				}
			}
		}
	}

	res.status(201).json({ message: statusMessage, claim, isVerified: isAnswerCorrect })
})

// View claims submitted by current user
claimApp.get('/my-claims', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claims = await ClaimModel.find({ claimant: req.user.userId })
		.populate({
			path: 'item',
			select: 'title category location images status postedBy',
			populate: { path: 'postedBy', select: 'name email phone avatar' },
		})
		.sort({ createdAt: -1 })

	res.status(200).json({ claims: claims.map(c => {
		const obj = c.toObject()
		return {
			...obj,
			deliveryMethod: obj.deliveryMethod || null,
			meetupLocation: obj.meetupLocation || '',
			meetupTime: obj.meetupTime || '',
		}
	}), count: claims.length })
})

// View claims for a specific item (Item Owner or Admin)
claimApp.get('/item-claims/:itemId', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const item = await ItemModel.findById(req.params.itemId).select('+verificationAnswer')
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to view claims for this item' })
	}

	const claims = await ClaimModel.find({ item: req.params.itemId })
		.populate('claimant', 'name email phone avatar')
		.sort({ createdAt: -1 })

	const evaluatedClaims = claims.map((c) => {
		const claimObj = c.toObject()
		const isAnswerMatch =
			item.verificationAnswer &&
			c.answer.toLowerCase().trim() === item.verificationAnswer.toLowerCase().trim()
		return { ...claimObj, isAnswerMatch }
	})

	res.status(200).json({
		item: { _id: item._id, title: item.title, verificationQuestion: item.verificationQuestion },
		claims: evaluatedClaims,
		count: claims.length,
	})
})

// Approve a claim
claimApp.patch('/claims/:claimId/approve', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claim = await ClaimModel.findById(req.params.claimId)
	if (!claim) {
		return res.status(404).json({ message: 'Claim not found' })
	}

	const item = await ItemModel.findById(claim.item)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to approve claims for this item' })
	}

	claim.status = 'approved'
	await claim.save()

	item.status = 'claimed'
	await item.save()

	await ClaimModel.updateMany(
		{ item: item._id, _id: { $ne: claim._id }, status: 'pending' },
		{ $set: { status: 'rejected' } }
	)

	res.status(200).json({ message: 'Claim approved successfully', claim, item })
})

// Reject a claim
claimApp.patch('/claims/:claimId/reject', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claim = await ClaimModel.findById(req.params.claimId)
	if (!claim) {
		return res.status(404).json({ message: 'Claim not found' })
	}

	const item = await ItemModel.findById(claim.item)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to reject claims for this item' })
	}

	claim.status = 'rejected'
	await claim.save()

	res.status(200).json({ message: 'Claim rejected successfully', claim })
})

// Mark claim as delivered (item owner confirms handover)
claimApp.patch('/claims/:claimId/deliver', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const { deliveryMethod, meetupLocation, meetupTime } = req.body
	const claim = await ClaimModel.findById(req.params.claimId)
	if (!claim) {
		return res.status(404).json({ message: 'Claim not found' })
	}

	const item = await ItemModel.findById(claim.item)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to mark this claim as delivered' })
	}

	if (claim.status !== 'verified') {
		return res.status(400).json({ message: 'Only verified claims can be marked as delivered' })
	}

	claim.status = 'approved'
	if (deliveryMethod) claim.deliveryMethod = deliveryMethod
	if (meetupLocation) claim.meetupLocation = meetupLocation
	if (meetupTime) claim.meetupTime = meetupTime
	await claim.save()

	item.status = 'claimed'
	await item.save()

	// Auto-reject all other pending/verified claims for this item
	await ClaimModel.updateMany(
		{ item: item._id, _id: { $ne: claim._id }, status: { $in: ['pending', 'verified'] } },
		{ $set: { status: 'rejected' } }
	)

	// Build notification message with delivery details
	const owner = await import('../models/UserModel.js').then(m => m.default.findById(req.user.userId))

	let notificationMessage = `${owner?.name || 'The item owner'} has approved your claim for "${item.title}".`
	if (deliveryMethod === 'meetup') {
		notificationMessage += `\n\n📍 Meetup Location: ${meetupLocation || 'To be decided'}`
		notificationMessage += `\n🕐 Meeting Time: ${meetupTime || 'To be decided'}`
	} else {
		notificationMessage += ` The item will be delivered to you. The owner will coordinate with you shortly.`
	}

	const notification = await NotificationModel.create({
		recipient: claim.claimant,
		sender: req.user.userId,
		type: 'item_delivered',
		title: 'Your Claim Was Approved!',
		message: notificationMessage,
		itemId: item._id,
		claimId: claim._id,
	})

	// Emit real-time notification
	const io = req.app.get('io')
	const connectedUsers = req.app.get('connectedUsers')
	if (io && connectedUsers) {
		const claimantSockets = connectedUsers.get(String(claim.claimant))
		if (claimantSockets) {
			for (const socketId of claimantSockets) {
				io.to(socketId).emit('notification', {
					...notification.toObject(),
					sender: { _id: req.user.userId, name: owner?.name || 'The item owner' },
					itemId: { _id: item._id, title: item.title },
				})
			}
		}
	}

	res.status(200).json({ message: 'Item delivered successfully', claim, item })
})

// Item owner keeps the item (reject verified claim)
claimApp.patch('/claims/:claimId/keep', verifyToken('USER', 'ADMIN'), async (req, res) => {
	const claim = await ClaimModel.findById(req.params.claimId)
	if (!claim) {
		return res.status(404).json({ message: 'Claim not found' })
	}

	const item = await ItemModel.findById(claim.item)
	if (!item) {
		return res.status(404).json({ message: 'Item not found' })
	}

	if (String(item.postedBy) !== String(req.user.userId) && req.user.role !== 'admin') {
		return res.status(403).json({ message: 'Not authorized to reject this claim' })
	}

	if (claim.status !== 'verified') {
		return res.status(400).json({ message: 'Only verified claims can be rejected at this stage' })
	}

	claim.status = 'rejected'
	await claim.save()

	// Notify the claimant that their claim was rejected
	const owner = await import('../models/UserModel.js').then(m => m.default.findById(req.user.userId))

	const notification = await NotificationModel.create({
		recipient: claim.claimant,
		sender: req.user.userId,
		type: 'item_kept',
		title: 'Claim Not Approved',
		message: `${owner?.name || 'The item owner'} has decided to keep the item "${item.title}" available. Your claim was not approved.`,
		itemId: item._id,
		claimId: claim._id,
	})

	// Emit real-time notification
	const io = req.app.get('io')
	const connectedUsers = req.app.get('connectedUsers')
	if (io && connectedUsers) {
		const claimantSockets = connectedUsers.get(String(claim.claimant))
		if (claimantSockets) {
			for (const socketId of claimantSockets) {
				io.to(socketId).emit('notification', {
					...notification.toObject(),
					sender: { _id: req.user.userId, name: owner?.name || 'The item owner' },
					itemId: { _id: item._id, title: item.title },
				})
			}
		}
	}

	res.status(200).json({ message: 'Claim rejected. The item remains available.', claim })
})

export default claimApp

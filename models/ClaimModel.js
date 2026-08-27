import mongoose from 'mongoose';

const claimSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'Claim must be associated with an item'],
    },
    claimant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Claim must have a claimant'],
    },
    answer: {
      type: String,
      required: [true, 'Please provide an answer to the verification question'],
      trim: true,
    },
    message: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

claimSchema.index({ item: 1, claimant: 1 }, { unique: true });

const ClaimModel = mongoose.model('Claim', claimSchema);
export default ClaimModel;

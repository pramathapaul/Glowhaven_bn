import mongoose from 'mongoose'

const promoRedemptionSchema = new mongoose.Schema({
  promo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PromoCode',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
})

// One redemption per user per promo code (enforced by the database)
promoRedemptionSchema.index({ promo: 1, user: 1 }, { unique: true })
promoRedemptionSchema.index({ user: 1 })

const PromoRedemption = mongoose.model('PromoRedemption', promoRedemptionSchema)

export default PromoRedemption

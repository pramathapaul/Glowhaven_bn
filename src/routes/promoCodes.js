import express from 'express'
import {
  getPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  validatePromoCode
} from '../controllers/promoController.js'
import { protect, admin, manager } from '../middleware/auth.js'

const router = express.Router()

// User routes
router.post('/validate', protect, validatePromoCode)

// Admin routes
router.get('/', protect, manager, getPromoCodes)
router.post('/', protect, admin, createPromoCode)
router.put('/:id', protect, admin, updatePromoCode)
router.delete('/:id', protect, admin, deletePromoCode)

export default router

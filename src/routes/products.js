import express from 'express'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getFeaturedProducts,
  getAllProductsAdmin,
  getCategories
} from '../controllers/productController.js'
import { protect, admin, manager } from '../middleware/auth.js'

const router = express.Router()

// Admin routes (must be before /:id)
router.get('/all', protect, manager, getAllProductsAdmin)

// Public routes
router.get('/categories', getCategories)
router.get('/', getProducts)
router.get('/featured', getFeaturedProducts)
router.get('/category/:category', getProductsByCategory)
router.get('/:id', getProduct)

// Admin routes
router.post('/', protect, admin, createProduct)
router.put('/:id', protect, admin, updateProduct)
router.delete('/:id', protect, admin, deleteProduct)

export default router
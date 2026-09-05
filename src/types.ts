export interface Category {
  id: string;
  name: string;
  sellerId: string;
  parentId?: string;
  order?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  images?: string[];
  videoUrl?: string;
  description: string;
  category: string;
  sellerId: string;
  storeName?: string;
  storeLogo?: string;
  sellerRole?: string;
  colors?: string[];
  sizes?: string[];
  order?: number;
  isActive?: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  minOrderAmount?: number;
  isActive: boolean;
  createdAt: any;
}

export interface Order {
  id: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  items: any[];
  totalPrice: number;
  subtotalPrice?: number;
  shippingCost?: number;
  originalPrice?: number;
  discount?: number;
  status: 'pending' | 'paid' | 'delivered' | 'canceled' | 'awaiting_verification';
  paymentMethod?: string;
  receiptUrl?: string;
  address: {
    city: string;
    area: string;
    street: string;
    building: string;
    apartment?: string;
  };
  rejectionReason?: string;
  sellerDeleted?: boolean;
  buyerDeleted?: boolean;
  sellerIds?: string[];
  createdAt: any;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export interface Banner {
  id: string;
  title?: string;
  imageUrl: string;
  link?: string;
  isActive: boolean;
  order: number;
  createdAt: any;
}

export interface User {
  id: string;
  name: string;
  phoneNumber: string;
  password?: string;
  email?: string;
  address?: any;
  role: 'buyer' | 'seller' | 'admin';
  storeName?: string;
  storeLogo?: string;
  createdAt: any;
}

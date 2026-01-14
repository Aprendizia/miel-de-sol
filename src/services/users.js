/**
 * Users Service - Manage customers and admins
 */
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// Demo users data
const demoUsers = [
  {
    id: '1',
    email: 'maria@email.com',
    full_name: 'María García',
    phone: '555-123-4567',
    role: 'customer',
    is_blocked: false,
    total_orders: 12,
    total_spent: 4580,
    created_at: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    email: 'juan@email.com',
    full_name: 'Juan Pérez',
    phone: '555-987-6543',
    role: 'customer',
    is_blocked: false,
    total_orders: 8,
    total_spent: 3200,
    created_at: '2024-02-20T14:45:00Z'
  },
  {
    id: '3',
    email: 'ana@email.com',
    full_name: 'Ana López',
    phone: '555-456-7890',
    role: 'customer',
    is_blocked: true,
    total_orders: 2,
    total_spent: 580,
    notes: 'Cuenta bloqueada por devoluciones frecuentes',
    created_at: '2024-03-10T09:15:00Z'
  },
  {
    id: '4',
    email: 'admin@modhu.com',
    full_name: 'Administrador',
    phone: '555-000-0000',
    role: 'admin',
    is_blocked: false,
    total_orders: 0,
    total_spent: 0,
    created_at: '2024-01-01T00:00:00Z'
  }
];

/**
 * Get all users with filters
 */
export async function getUsers(filters = {}) {
  if (isDemoMode) {
    let users = [...demoUsers];
    
    if (filters.role) {
      users = users.filter(u => u.role === filters.role);
    }
    if (filters.blocked !== undefined) {
      users = users.filter(u => u.is_blocked === filters.blocked);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      users = users.filter(u => 
        u.email.toLowerCase().includes(searchLower) ||
        u.full_name?.toLowerCase().includes(searchLower)
      );
    }
    
    return { data: users, count: users.length };
  }

  let query = supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact' });

  if (filters.role) {
    query = query.eq('role', filters.role);
  }
  if (filters.blocked !== undefined) {
    query = query.eq('is_blocked', filters.blocked);
  }
  if (filters.search) {
    query = query.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`);
  }

  query = query.order('created_at', { ascending: false });

  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data: data || [], count };
}

/**
 * Get user by ID with orders
 */
export async function getUserById(id) {
  if (isDemoMode) {
    const user = demoUsers.find(u => u.id === id);
    if (user) {
      user.orders = [
        { order_number: 'ORD001', total: 580, status: 'delivered', created_at: '2024-06-15' },
        { order_number: 'ORD002', total: 320, status: 'shipped', created_at: '2024-07-20' }
      ];
      user.addresses = [
        { label: 'Casa', street: 'Calle Principal 123', city: 'CDMX', state: 'CDMX', postal_code: '06600' }
      ];
    }
    return user;
  }

  const { data: user, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;

  // Get user orders
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('order_number, total, status, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get user addresses
  const { data: addresses } = await supabaseAdmin
    .from('addresses')
    .select('*')
    .eq('user_id', id);

  user.orders = orders || [];
  user.addresses = addresses || [];

  return user;
}

/**
 * Update user
 */
export async function updateUser(id, userData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Usuario actualizado' };
  }

  const updateData = {};
  
  if (userData.full_name !== undefined) updateData.full_name = userData.full_name;
  if (userData.phone !== undefined) updateData.phone = userData.phone;
  if (userData.role !== undefined) updateData.role = userData.role;
  if (userData.is_blocked !== undefined) updateData.is_blocked = userData.is_blocked;
  if (userData.notes !== undefined) updateData.notes = userData.notes;

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Block/Unblock user
 */
export async function toggleUserBlock(id, blocked, notes = null) {
  if (isDemoMode) {
    return { success: true, message: `(Demo) Usuario ${blocked ? 'bloqueado' : 'desbloqueado'}` };
  }

  const updateData = { is_blocked: blocked };
  if (notes) {
    updateData.notes = notes;
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Get customer statistics
 */
export async function getCustomerStats() {
  if (isDemoMode) {
    return {
      total: 324,
      active: 298,
      blocked: 26,
      newThisMonth: 45,
      topSpenders: demoUsers.filter(u => u.role === 'customer').slice(0, 5)
    };
  }

  const { count: total } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'customer');

  const { count: blocked } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'customer')
    .eq('is_blocked', true);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { count: newThisMonth } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'customer')
    .gte('created_at', monthStart);

  const { data: topSpenders } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('role', 'customer')
    .order('total_spent', { ascending: false })
    .limit(5);

  return {
    total: total || 0,
    active: (total || 0) - (blocked || 0),
    blocked: blocked || 0,
    newThisMonth: newThisMonth || 0,
    topSpenders: topSpenders || []
  };
}

export default {
  getUsers,
  getUserById,
  updateUser,
  toggleUserBlock,
  getCustomerStats
};

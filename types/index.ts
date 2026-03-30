// Fridge Manager 앱 전체에서 사용하는 타입 정의

export interface User {
  id: string;
  email: string;
  nickname?: string;
  household_size: number;
  cuisine_prefs: string[];
  food_restrictions: string[];
  shopping_platforms: string[];
  diet_mode: 'diet' | 'healthy' | 'none';
  shopping_day: string[];
  shopping_time: 'morning' | 'afternoon' | 'evening' | 'night';
  is_earlybird: boolean;
  onboarding_completed: boolean;
  onboarding_completed_at?: string;
  created_at: string;
}

export interface Fridge {
  id: string;
  name: string;
  created_at: string;
}

export interface FridgeMember {
  fridge_id: string;
  user_id: string;
  role: 'owner' | 'member';
}

export interface FridgeInvite {
  id: string;
  fridge_id: string;
  code: string;
  created_by: string;
  expires_at: string;
  created_at: string;
}

export interface Ingredient {
  id: string;
  fridge_id: string;
  name: string;
  original_name?: string;
  category: 'vegetable' | 'meat' | 'dairy' | 'processed' | 'beverage' | 'condiment' | 'other';
  storage_type: 'fridge' | 'freezer' | 'room_temp';
  storage_tip?: string;
  quantity: number;
  unit: string;
  market_price?: number;
  purchase_date: string;
  expiry_date?: string;
  ai_expiry_days?: number;
  ai_expiry_note?: string;
  source: 'camera' | 'barcode' | 'receipt' | 'manual' | 'package';
  barcode?: string;
  is_consumed: boolean;
  consumed_at?: string;
  consumed_type?: 'eaten' | 'discarded';
  consumption_log?: { date: string; amount: number; unit: string; type: 'eaten' | 'discarded' }[];
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  fridge_id: string;
  user_id: string;
  source: 'receipt' | 'manual' | 'push_detected';
  platform?: string;
  raw_text?: string;
  total_amount?: number;
  purchased_at: string;
  created_at: string;
}

export interface MonthlyReport {
  id: string;
  user_id: string;
  fridge_id: string;
  year_month: string;
  total_ingredients: number;
  consumed_count: number;
  discarded_count: number;
  consumption_rate?: number;
  saved_amount: number;
  prev_month_rate?: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  menu_name: string;
  steps: RecipeStep[];
  ingredients: RecipeIngredient[];
  time_minutes?: number;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: string;
}

export interface RecipeStep {
  step: number;
  desc: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
}

export interface ShoppingItem {
  id: string;
  fridge_id: string;
  name: string;
  quantity: number;
  unit: string;
  source: 'menu_suggest' | 'manual';
  menu_name?: string;
  is_purchased: boolean;
  created_at: string;
}

export interface MenuRecommendation {
  menu_name: string;
  available_ingredients: string[];
  missing_ingredients: string[];
  urgency_used: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  time_minutes: number;
}

export interface IngredientInference {
  name: string;
  category: Ingredient['category'];
  storage_type: Ingredient['storage_type'];
  storage_tip: string;
  ai_expiry_days: number;
  ai_expiry_note: string;
  market_price: number;
  is_food: boolean;
  confidence: number;
}

// D-day 계산 결과 타입
export type DayStatus = 'safe' | 'warning' | 'danger' | 'expired';

export interface DayInfo {
  daysLeft: number;
  status: DayStatus;
  label: string; // 'D-3', 'D+1', 'D-14' 등
}

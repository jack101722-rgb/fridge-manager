import { create } from 'zustand';
import { Ingredient, Fridge, User, ShoppingItem } from '../types';

interface FridgeStore {
  // 현재 로그인 유저
  user: User | null;
  setUser: (user: User | null) => void;

  // 현재 냉장고
  fridge: Fridge | null;
  setFridge: (fridge: Fridge | null) => void;

  // 식재료 목록
  ingredients: Ingredient[];
  setIngredients: (ingredients: Ingredient[]) => void;
  addIngredient: (ingredient: Ingredient) => void;
  updateIngredient: (id: string, updates: Partial<Ingredient>) => void;
  removeIngredient: (id: string) => void;

  // 장보기 목록
  shoppingItems: ShoppingItem[];
  setShoppingItems: (items: ShoppingItem[]) => void;
  addShoppingItem: (item: ShoppingItem) => void;
  updateShoppingItem: (id: string, updates: Partial<ShoppingItem>) => void;
  toggleShoppingItem: (id: string) => void;
  removeShoppingItems: (ids: string[]) => void;

  // 알림 딥링크 (탭 시 열 재료 ID)
  pendingIngredientId: string | null;
  setPendingIngredientId: (id: string | null) => void;

  // 서비스 소개 온보딩 (로그인 전)
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (seen: boolean) => void;

  // 로딩 상태
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const useFridgeStore = create<FridgeStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  fridge: null,
  setFridge: (fridge) => set({ fridge }),

  ingredients: [],
  setIngredients: (ingredients) => set({ ingredients }),
  addIngredient: (ingredient) =>
    set((state) => ({ ingredients: [ingredient, ...state.ingredients] })),
  updateIngredient: (id, updates) =>
    set((state) => ({
      ingredients: state.ingredients.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      ),
    })),
  removeIngredient: (id) =>
    set((state) => ({
      ingredients: state.ingredients.filter((i) => i.id !== id),
    })),

  shoppingItems: [],
  setShoppingItems: (items) => set({ shoppingItems: items }),
  addShoppingItem: (item) =>
    set((state) => ({ shoppingItems: [...state.shoppingItems, item] })),
  updateShoppingItem: (id, updates) =>
    set((state) => ({
      shoppingItems: state.shoppingItems.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      ),
    })),
  toggleShoppingItem: (id) =>
    set((state) => ({
      shoppingItems: state.shoppingItems.map((i) =>
        i.id === id ? { ...i, is_purchased: !i.is_purchased } : i
      ),
    })),
  removeShoppingItems: (ids) =>
    set((state) => ({
      shoppingItems: state.shoppingItems.filter((i) => !ids.includes(i.id)),
    })),

  pendingIngredientId: null,
  setPendingIngredientId: (id) => set({ pendingIngredientId: id }),

  hasSeenWelcome: false,
  setHasSeenWelcome: (hasSeenWelcome) => set({ hasSeenWelcome }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
}));
